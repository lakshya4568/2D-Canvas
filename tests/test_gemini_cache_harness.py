"""
Tests for Python gemini_cache_harness.
"""

from unittest.mock import MagicMock
import pytest

from gemini_cache_harness import (
    CostMeter,
    CachePolicy,
    SessionCache,
    CacheManager,
    AgentHarness,
    Tool,
    PRICE_INPUT,
    PRICE_CACHE_READ,
    MIN_CACHE_TOKENS,
)


def test_cost_meter_zero_cached():
    meter = CostMeter()
    usage = MagicMock()
    usage.prompt_token_count = 10_000
    usage.cached_content_token_count = 0
    usage.candidates_token_count = 400
    usage.thoughts_token_count = 100

    tc = meter.record(usage)
    assert tc.input_tokens == 10_000
    assert tc.cached_tokens == 0
    assert tc.output_tokens == 500
    assert tc.thoughts_tokens == 100

    expected_cost = 10_000 / 1e6 * PRICE_INPUT
    assert pytest.approx(tc.uncached_input_cost, rel=1e-5) == expected_cost
    assert pytest.approx(tc.actual_input_cost, rel=1e-5) == expected_cost
    assert tc.saved == 0.0

    summary = meter.summary()
    assert summary["turns"] == 1
    assert summary["cache_hit_rate"] == 0.0
    assert summary["input_saved_usd"] == 0.0


def test_cost_meter_90_percent_discount():
    meter = CostMeter()
    usage = MagicMock()
    usage.prompt_token_count = 20_000
    usage.cached_content_token_count = 16_000
    usage.candidates_token_count = 500
    usage.thoughts_token_count = 0

    tc = meter.record(usage)
    expected_uncached = 20_000 / 1e6 * PRICE_INPUT  # 0.015
    expected_actual = (4_000 / 1e6 * PRICE_INPUT) + (16_000 / 1e6 * PRICE_CACHE_READ)
    expected_saved = expected_uncached - expected_actual

    assert pytest.approx(tc.uncached_input_cost, rel=1e-5) == expected_uncached
    assert pytest.approx(tc.actual_input_cost, rel=1e-5) == expected_actual
    assert pytest.approx(tc.saved, rel=1e-5) == expected_saved

    summary = meter.summary()
    assert summary["turns"] == 1
    assert summary["cache_hit_rate"] == 0.8
    assert pytest.approx(summary["input_saved_usd"], rel=1e-5) == expected_saved


def test_cache_manager_make_cache_key():
    key1 = CacheManager.make_cache_key(
        system_instruction="System prompt",
        tools=[{"name": "toolA"}],
        static_contents=[{"role": "user", "parts": [{"text": "hello"}]}],
    )
    key2 = CacheManager.make_cache_key(
        system_instruction="System prompt",
        tools=[{"name": "toolA"}],
        static_contents=[{"role": "user", "parts": [{"text": "hello"}]}],
    )
    assert key1 == key2
    assert len(key1) == 64


def test_cache_manager_promotion_and_teardown():
    client = MagicMock()
    mock_cache = MagicMock()
    mock_cache.name = "cachedContents/test-123"
    client.caches.create.return_value = mock_cache

    policy = CachePolicy(promote_after_turns=2, promote_min_tokens=10_000, ttl_seconds=3600)
    manager = CacheManager(client, policy)

    session = SessionCache(
        cache_key="key-abc",
        system_instruction="SI",
        tools=[],
        static_contents=[],
        prefix_tokens=15_000,
    )

    # Turn 1: under threshold
    assert manager.maybe_promote(session) is False
    assert session.cached_content is None

    # Turn 2: reaches promote_after_turns and prefix_tokens >= 10_000
    assert manager.maybe_promote(session) is True
    assert session.cached_content == mock_cache
    client.caches.create.assert_called_once()

    # Teardown deletes the explicit cache
    manager.teardown(session)
    client.caches.delete.assert_called_once_with(name="cachedContents/test-123")
    assert session.cached_content is None


def test_agent_harness_loop():
    client = MagicMock()
    client.models.count_tokens.return_value = MagicMock(total_tokens=7500)

    # Turn 1: Model calls a tool
    fc_part = MagicMock()
    fc_part.function_call = MagicMock(name="draw_box", args={"w": 100})
    fc_part.function_call.name = "draw_box"
    fc_part.function_call.args = {"w": 100}
    fc_part.function_call.model_dump.return_value = {"name": "draw_box", "args": {"w": 100}}
    fc_part.text = None

    cand1 = MagicMock()
    cand1.content.parts = [fc_part]

    usage1 = MagicMock()
    usage1.prompt_token_count = 7500
    usage1.cached_content_token_count = 0
    usage1.candidates_token_count = 50
    usage1.thoughts_token_count = 0

    resp1 = MagicMock()
    resp1.candidates = [cand1]
    resp1.function_calls = [fc_part.function_call]
    resp1.usage_metadata = usage1
    resp1.text = None

    # Turn 2: Model finishes with answer
    text_part = MagicMock()
    text_part.function_call = None
    text_part.text = "Drawing complete."

    cand2 = MagicMock()
    cand2.content.parts = [text_part]

    usage2 = MagicMock()
    usage2.prompt_token_count = 8000
    usage2.cached_content_token_count = 7500  # Implicit hit!
    usage2.candidates_token_count = 40
    usage2.thoughts_token_count = 0

    resp2 = MagicMock()
    resp2.candidates = [cand2]
    resp2.function_calls = []
    resp2.usage_metadata = usage2
    resp2.text = "Drawing complete."

    client.models.generate_content.side_effect = [resp1, resp2]

    tool_called = {}

    def on_tool(name, args):
        tool_called[name] = args
        return {"status": "ok"}

    tool = Tool(
        function_declarations=[{
            "name": "draw_box",
            "description": "Draw a box",
            "parameters": {
                "type": "object",
                "properties": {"w": {"type": "integer"}},
                "required": ["w"],
            },
        }]
    )

    harness = AgentHarness(
        system_instruction="You are a CAD agent",
        tools=[tool],
        static_contents=[{"role": "user", "parts": [{"text": "Draw box"}]}],
        client=client,
        on_tool_call=on_tool,
    )

    result = harness.run("Please draw box")
    assert result == "Drawing complete."
    assert tool_called == {"draw_box": {"w": 100}}

    summary = harness.finish()
    assert summary["turns"] == 2
    assert summary["cache_hit_rate"] > 0
    assert summary["input_saved_usd"] > 0
