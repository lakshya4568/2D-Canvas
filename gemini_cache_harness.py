"""
Prompt caching layer for an agent harness running Gemini 3.8 Flash on Vertex AI.

Strategy:
  1. Implicit caching (default): send byte-identical stable prefix every turn.
  2. Explicit caching (promotion): once the same prefix is reused enough,
     freeze it into a CachedContent (system_instruction + tools + static docs)
     and reference it by name. Saves storage cost by deleting on session end.

Requires: pip install google-genai
Env: GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION set; ADC configured.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Callable

try:
    from google import genai
    from google.genai.types import (
        CachedContent,
        CreateCachedContentConfig,
        GenerateContentConfig,
        Tool,
        UpdateCachedContentConfig,
    )
except ImportError:
    genai = None  # type: ignore
    CachedContent = Any  # type: ignore
    CreateCachedContentConfig = Any  # type: ignore
    GenerateContentConfig = Any  # type: ignore
    Tool = Any  # type: ignore
    UpdateCachedContentConfig = Any  # type: ignore

MODEL = "gemini-3.8-flash"
MIN_CACHE_TOKENS = 6144  # 3.8 Flash implicit-caching minimum; verify with count_tokens


# --------------------------------------------------------------------------
# Cost meter: reads usageMetadata to measure cache hits and savings.
# --------------------------------------------------------------------------

@dataclass
class TurnCost:
    input_tokens: int
    cached_tokens: int
    output_tokens: int
    thoughts_tokens: int
    uncached_input_cost: float
    actual_input_cost: float
    saved: float


# Per-1M-token rates — check current Vertex pricing page for your region.
PRICE_INPUT = 0.75
PRICE_OUTPUT = 3.75
PRICE_CACHE_READ = 0.075  # 90% off input


class CostMeter:
    def __init__(self) -> None:
        self.turns: list[TurnCost] = []

    def record(self, usage: Any) -> TurnCost:
        total_in = getattr(usage, "prompt_token_count", 0) or 0
        cached = getattr(usage, "cached_content_token_count", 0) or 0
        billable_in = max(0, total_in - cached)
        thoughts = getattr(usage, "thoughts_token_count", 0) or 0
        out = (getattr(usage, "candidates_token_count", 0) or 0) + thoughts

        uncached = total_in / 1e6 * PRICE_INPUT
        actual = (
            billable_in / 1e6 * PRICE_INPUT
            + cached / 1e6 * PRICE_CACHE_READ
        )
        tc = TurnCost(
            input_tokens=total_in,
            cached_tokens=cached,
            output_tokens=out,
            thoughts_tokens=thoughts,
            uncached_input_cost=uncached,
            actual_input_cost=actual,
            saved=uncached - actual,
        )
        self.turns.append(tc)
        return tc

    def summary(self) -> dict[str, Any]:
        n = len(self.turns)
        if not n:
            return {
                "turns": 0,
                "cache_hit_rate": 0.0,
                "input_saved_usd": 0.0,
                "output_tokens": 0,
            }
        cached = sum(t.cached_tokens for t in self.turns)
        total_in = sum(t.input_tokens for t in self.turns)
        return {
            "turns": n,
            "cache_hit_rate": round(cached / total_in, 3) if total_in else 0.0,
            "input_saved_usd": round(sum(t.saved for t in self.turns), 6),
            "output_tokens": sum(t.output_tokens for t in self.turns),
        }


# --------------------------------------------------------------------------
# CacheManager: implicit-first, promotes to explicit on sustained reuse.
# --------------------------------------------------------------------------

@dataclass
class CachePolicy:
    # Promote to explicit cache after this many identical-prefix turns.
    promote_after_turns: int = 3
    # Only promote if prefix is at least this many tokens (storage costs money).
    promote_min_tokens: int = 20_000
    ttl_seconds: int = 3600


@dataclass
class SessionCache:
    cache_key: str
    system_instruction: str
    tools: list[Any]
    static_contents: list[dict]  # immutable session context (RAG docs etc.)
    history: list[dict] = field(default_factory=list)  # append-only conversation
    cached_content: Any = None
    prefix_tokens: int = 0

    def append(self, content: dict) -> None:
        self.history.append(content)


class CacheManager:
    def __init__(self, client: Any, policy: CachePolicy | None = None):
        self.client = client
        self.policy = policy or CachePolicy()
        self._reuse_count: dict[str, int] = {}

    @staticmethod
    def _dump_tool(t: Any) -> Any:
        if hasattr(t, "model_dump"):
            return t.model_dump(exclude_none=True)
        if isinstance(t, dict):
            return t
        return str(t)

    @classmethod
    def make_cache_key(cls, system_instruction: str, tools: list[Any], static_contents: list[dict]) -> str:
        payload = json.dumps(
            {
                "si": system_instruction,
                "tools": [cls._dump_tool(t) for t in tools],
                "static": static_contents,
            },
            sort_keys=True,
        )
        return hashlib.sha256(payload.encode()).hexdigest()

    def count_prefix_tokens(
        self, session: SessionCache, tools: list[Any], system_instruction: str
    ) -> int:
        if not self.client or not hasattr(self.client, "models"):
            return 0
        try:
            resp = self.client.models.count_tokens(
                model=MODEL,
                contents=session.static_contents,
                config=GenerateContentConfig(
                    system_instruction=system_instruction, tools=tools
                ),
            )
            return getattr(resp, "total_tokens", 0) or 0
        except Exception:
            return 0

    def maybe_promote(self, session: SessionCache) -> bool:
        """Create an explicit cache if reuse + size justify storage cost."""
        if session.cached_content is not None:
            return True
        self._reuse_count[session.cache_key] = (
            self._reuse_count.get(session.cache_key, 0) + 1
        )
        if self._reuse_count[session.cache_key] < self.policy.promote_after_turns:
            return False
        if session.prefix_tokens < self.policy.promote_min_tokens:
            return False
        if session.prefix_tokens and session.prefix_tokens < MIN_CACHE_TOKENS:
            return False

        if not self.client or not hasattr(self.client, "caches"):
            return False

        try:
            session.cached_content = self.client.caches.create(
                model=MODEL,
                config=CreateCachedContentConfig(
                    system_instruction=session.system_instruction,
                    tools=session.tools,  # tool declarations are cached too
                    contents=session.static_contents,
                    display_name=f"harness-{session.cache_key[:12]}",
                    ttl=f"{self.policy.ttl_seconds}s",
                ),
            )
            return True
        except Exception:
            return False

    def refresh_ttl(self, session: SessionCache) -> None:
        if session.cached_content is not None and self.client and hasattr(self.client, "caches"):
            try:
                name = getattr(session.cached_content, "name", str(session.cached_content))
                self.client.caches.update(
                    name=name,
                    config=UpdateCachedContentConfig(ttl=f"{self.policy.ttl_seconds}s"),
                )
            except Exception:
                pass

    def teardown(self, session: SessionCache) -> None:
        """Always call at session end — storage is billed until expiry."""
        if session.cached_content is not None:
            try:
                if self.client and hasattr(self.client, "caches"):
                    name = getattr(session.cached_content, "name", str(session.cached_content))
                    self.client.caches.delete(name=name)
            except Exception:
                pass
            finally:
                session.cached_content = None


# --------------------------------------------------------------------------
# The agent loop: stable prefix, append-only history, cache-aware calls.
# --------------------------------------------------------------------------

class AgentHarness:
    def __init__(
        self,
        system_instruction: str,
        tools: list[Any],
        static_contents: list[dict] | None = None,
        client: Any | None = None,
        policy: CachePolicy | None = None,
        on_tool_call: Callable[[str, dict], dict] | None = None,
    ):
        if client is not None:
            self.client = client
        elif genai is not None:
            self.client = genai.Client(vertexai=True)
        else:
            self.client = None

        self.cache_manager = CacheManager(self.client, policy)
        self.meter = CostMeter()
        self.on_tool_call = on_tool_call or (lambda name, args: {"result": "noop"})

        self.session = SessionCache(
            cache_key=CacheManager.make_cache_key(system_instruction, tools, static_contents or []),
            system_instruction=system_instruction,
            tools=tools,
            static_contents=static_contents or [],
        )
        self.session.prefix_tokens = self.cache_manager.count_prefix_tokens(
            self.session, tools, system_instruction
        )

    def _build_request(self, new_contents: list[dict]) -> dict:
        """
        Canonical request layout — THE rule that makes caching work:
          [cached: SI + tools + static docs] + [append-only history] + [new turn]
        Never reorder, never edit history in place, never vary SI/tools per turn.
        """
        if self.session.cached_content is not None:
            # Explicit mode: prefix lives server-side in the CachedContent.
            # Do NOT re-send system_instruction or tools here — they are
            # frozen in the cache; re-sending or changing them invalidates it.
            name = getattr(self.session.cached_content, "name", str(self.session.cached_content))
            return {
                "contents": self.session.history + new_contents,
                "config": GenerateContentConfig(
                    cached_content=name,
                ),
            }
        # Implicit mode: send the full byte-identical prefix every turn.
        return {
            "contents": self.session.static_contents + self.session.history + new_contents,
            "config": GenerateContentConfig(
                system_instruction=self.session.system_instruction,
                tools=self.session.tools,
            ),
        }

    def _record(self, user_content: dict, assistant_content: dict) -> None:
        self.session.append(user_content)
        self.session.append(assistant_content)

    def run(self, user_text: str, max_steps: int = 8) -> str:
        user_content = {"role": "user", "parts": [{"text": user_text}]}
        pending = [user_content]

        for _ in range(max_steps):
            req = self._build_request(pending)
            resp = self.client.models.generate_content(
                model=MODEL, **req
            )
            self.meter.record(resp.usage_metadata)

            fn_calls = getattr(resp, "function_calls", None) or []
            if not fn_calls:
                final = getattr(resp, "text", "") or ""
                self._record(user_content, self._as_model(resp))
                return final

            for fc in fn_calls:
                fc_name = getattr(fc, "name", "")
                fc_args = getattr(fc, "args", {}) or {}
                result = self.on_tool_call(fc_name, dict(fc_args))
                pending.append(
                    {
                        "role": "user",
                        "parts": [{
                            "function_response": {
                                "name": fc_name,
                                "response": result,
                            }
                        }],
                    }
                )

            # After a completed tool round, consider promoting to explicit.
            if len(self.session.history) >= 2 * self.cache_manager.policy.promote_after_turns:
                self.cache_manager.maybe_promote(self.session)

        return "[max steps reached]"

    @staticmethod
    def _as_model(resp: Any) -> dict:
        parts = []
        for c in getattr(resp, "candidates", None) or []:
            content = getattr(c, "content", None)
            if not content:
                continue
            for p in getattr(content, "parts", None) or []:
                fc = getattr(p, "function_call", None)
                if fc:
                    fc_dump = fc.model_dump(exclude_none=True) if hasattr(fc, "model_dump") else fc
                    parts.append({"function_call": fc_dump})
                elif getattr(p, "text", None):
                    parts.append({"text": p.text})
        return {"role": "model", "parts": parts}

    def finish(self) -> dict[str, Any]:
        self.cache_manager.teardown(self.session)
        return self.meter.summary()
