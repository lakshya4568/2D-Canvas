/**
 * Pre-Display Candidate Clustering & Lifecycle Engine
 * UPCE-MASTER-1.0 §42, §47, Clause 5, Clause 6
 *
 * 1. Groups candidates by predicate signature.
 * 2. 1-D DBSCAN or metric binning at TolerancePolicy.cluster_mm (1.0 mm).
 * 3. Synthesizes merged parameter cards (e.g. 4 parallel offsets binned to 300 mm
 *    collapse into a single WallThickness candidate card with 4 occurrences).
 * 4. Manages candidate lifecycle state transitions and rejection memory.
 */

import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";
import { classifySemanticParameter } from "./semanticVocabulary";

export type CandidatePredicateType =
  | "P1_PARALLEL"
  | "P2_PERPENDICULAR"
  | "P3_PARALLEL_OFFSET"
  | "P4_CORNER_CHAMFER"
  | "P5_CONCENTRIC_RADIAL_OFFSET"
  | "P6_TANGENT"
  | "P8_COINCIDENCE"
  | "P9_SYMMETRY"
  | "POINT_ON_LINE"
  | "POINT_ON_CIRCLE"
  | "EQUAL_LENGTH"
  | "SIGNED_ANGLE"
  | "DISTANCE"
  | "FIXED_ENTITY";

export type CandidateConfidence = "GeometricFact" | "Inference" | "UserConstraint";

export type CandidateLifecycleStatus =
  | "pending"
  | "admissible"
  | "redundant"
  | "conflicting"
  | "accepted"
  | "rejected"
  | "superseded";

export interface ConstraintCandidate {
  id: string;
  predicate: CandidatePredicateType;
  entityIds: string[];
  nominalValue: number;
  measuredDeviation: number;
  confidence: CandidateConfidence;
  status: CandidateLifecycleStatus;
  provenance: string;
  contextId?: string; // e.g. faceId, assemblyId, component context
  parameterName?: string;
  displayName?: string;
  description?: string;
  gradient?: number[]; // System coordinate gradient for SVD admissibility
  residual?: number;   // Current constraint residual f(X)
  diagnosis?: string;
}

export interface MergedParameterCard {
  id: string;
  predicate: CandidatePredicateType;
  signature: string;
  parameterName: string;
  displayName: string;
  nominalValue: number;       // Clustered average nominal value
  occurrences: number;        // Number of merged instances
  entities: string[];         // Distinct constrained entities
  candidateIds: string[];
  candidates: ConstraintCandidate[];
  clusterRange: [number, number]; // [min, max]
  status: CandidateLifecycleStatus;
  confidence: CandidateConfidence;
  description: string;
  diagnosis?: string;
}

/**
 * Derives a human-readable display and parameter name for a merged candidate card.
 */
function deriveCardNames(
  predicate: CandidatePredicateType,
  candidates: ConstraintCandidate[]
): { parameterName: string; displayName: string } {
  // If candidates already specify a parameterName, use the most frequent
  const nameCounts = new Map<string, number>();
  for (const c of candidates) {
    if (c.parameterName) {
      nameCounts.set(c.parameterName, (nameCounts.get(c.parameterName) || 0) + 1);
    }
  }

  if (nameCounts.size > 0) {
    let bestName = "";
    let maxCount = 0;
    for (const [name, count] of nameCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        bestName = name;
      }
    }
    const displayName = bestName
      .replace(/([A-Z])/g, " $1")
      .trim()
      .replace(/^./, (str) => str.toUpperCase());
    return { parameterName: bestName, displayName };
  }

  const contextId = candidates[0]?.contextId;
  return classifySemanticParameter(predicate, { context: contextId });
}

let globalCardCounter = 0;

/**
 * 1-D Metric clustering using TolerancePolicy.cluster_mm.
 * Groups candidates by predicate signature, then bins near-equal values.
 */
export function clusterCandidates(
  candidates: ConstraintCandidate[],
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): MergedParameterCard[] {
  if (candidates.length === 0) return [];

  const clusterMm = policy.cluster_mm;
  const angleBinDeg = (policy.angle_rad * 180.0) / Math.PI;

  // 1. Group by predicate signature (predicate + optional parameterName + optional context)
  const groupsBySignature = new Map<string, ConstraintCandidate[]>();
  for (const cand of candidates) {
    const parts: string[] = [cand.predicate];
    if (cand.parameterName) parts.push(cand.parameterName);
    if (cand.contextId) parts.push(cand.contextId);
    const sig = parts.join("::");
    let group = groupsBySignature.get(sig);
    if (!group) {
      group = [];
      groupsBySignature.set(sig, group);
    }
    group.push(cand);
  }

  const mergedCards: MergedParameterCard[] = [];

  // 2. Cluster each signature group along 1-D measured values
  for (const [sig, groupCandidates] of groupsBySignature.entries()) {
    // Sort by nominalValue
    const sorted = [...groupCandidates].sort((a, b) => a.nominalValue - b.nominalValue);

    // 1-D DBSCAN / metric binning
    const clusters: ConstraintCandidate[][] = [];
    let currentCluster: ConstraintCandidate[] = [];

    const isAnglePredicate =
      groupCandidates[0]?.predicate === "SIGNED_ANGLE" ||
      groupCandidates[0]?.predicate === "P2_PERPENDICULAR";
    const binThreshold = isAnglePredicate ? Math.max(1.0, angleBinDeg) : clusterMm;

    for (let i = 0; i < sorted.length; i++) {
      const cand = sorted[i];
      if (currentCluster.length === 0) {
        currentCluster.push(cand);
      } else {
        const lastVal = currentCluster[currentCluster.length - 1].nominalValue;
        // Check if within binThreshold of adjacent item or cluster span
        if (Math.abs(cand.nominalValue - lastVal) <= binThreshold) {
          currentCluster.push(cand);
        } else {
          clusters.push(currentCluster);
          currentCluster = [cand];
        }
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    // 3. Synthesize Merged Parameter Cards from clusters
    for (const cluster of clusters) {
      const predicate = cluster[0].predicate;
      const count = cluster.length;

      let sumVal = 0;
      let minVal = Infinity;
      let maxVal = -Infinity;
      const entityIdSet = new Set<string>();
      const candidateIds: string[] = [];

      let hasConflicting = false;
      let hasAdmissible = false;
      let allRedundant = true;
      let allAccepted = cluster.length > 0;
      let allRejected = cluster.length > 0;
      let allFact = true;
      let diagnosisMsg: string | undefined;

      for (const c of cluster) {
        sumVal += c.nominalValue;
        if (c.nominalValue < minVal) minVal = c.nominalValue;
        if (c.nominalValue > maxVal) maxVal = c.nominalValue;
        for (const eid of c.entityIds) {
          entityIdSet.add(eid);
        }
        candidateIds.push(c.id);

        if (c.status === "conflicting") {
          hasConflicting = true;
          if (!diagnosisMsg && c.diagnosis) diagnosisMsg = c.diagnosis;
        }
        if (c.status === "admissible") hasAdmissible = true;
        if (c.status !== "redundant") allRedundant = false;
        if (c.status !== "accepted") allAccepted = false;
        if (c.status !== "rejected") allRejected = false;
        if (c.confidence !== "GeometricFact") allFact = false;
      }

      const nominalAvg = sumVal / count;
      const { parameterName, displayName } = deriveCardNames(predicate, cluster);

      let cardStatus: CandidateLifecycleStatus = "pending";
      if (hasConflicting) {
        cardStatus = "conflicting";
      } else if (hasAdmissible) {
        cardStatus = "admissible";
      } else if (allAccepted) {
        cardStatus = "accepted";
      } else if (allRejected) {
        cardStatus = "rejected";
      } else if (allRedundant && cluster.length > 0) {
        cardStatus = "redundant";
      }

      const cardId = `card_${predicate.toLowerCase()}_${++globalCardCounter}`;
      const desc =
        count > 1
          ? `Merged ${count} ${displayName.toLowerCase()} candidates to ${nominalAvg.toFixed(2)} mm`
          : `${displayName} candidate of ${nominalAvg.toFixed(2)} mm`;

      const contextPart = cluster[0]?.contextId ? `::${cluster[0].contextId}` : "";
      const cardSignature = `${predicate}::${parameterName}${contextPart}::${nominalAvg.toFixed(1)}`;

      mergedCards.push({
        id: cardId,
        predicate,
        signature: cardSignature,
        parameterName,
        displayName,
        nominalValue: nominalAvg,
        occurrences: count,
        entities: Array.from(entityIdSet),
        candidateIds,
        candidates: cluster,
        clusterRange: [minVal, maxVal],
        status: cardStatus,
        confidence: allFact ? "GeometricFact" : "Inference",
        description: desc,
        diagnosis: diagnosisMsg,
      });
    }
  }

  return mergedCards;
}

/**
 * Lifecycle Manager for Candidate Curation, Rejection Memory, and Clean Superseding (§47).
 */
export class CandidateLifecycleManager {
  private rejectionMemory = new Set<string>();
  private activeCards = new Map<string, MergedParameterCard>();
  private supersededCards = new Map<string, MergedParameterCard>();

  /**
   * Generates a stable key for candidate rejection memory based on entity set.
   */
  public getCandidateKey(candidate: ConstraintCandidate): string {
    const sortedEntities = [...candidate.entityIds].sort().join("::");
    return `${candidate.predicate}::${sortedEntities}`;
  }

  /**
   * Generates a signature key for candidate rejection memory.
   * Returns null if candidate lacks both parameterName and contextId,
   * ensuring bare predicates do not broadly suppress all candidate suggestions.
   */
  public getCandidateSignatureKey(candidate: ConstraintCandidate): string | null {
    if (!candidate.parameterName && !candidate.contextId) return null;
    const parts: string[] = [candidate.predicate];
    if (candidate.parameterName) parts.push(candidate.parameterName);
    if (candidate.contextId) parts.push(candidate.contextId);
    parts.push(candidate.nominalValue.toFixed(1));
    return parts.join("::");
  }

  /**
   * Checks whether a candidate is suppressed by persistent session rejection memory.
   */
  public isCandidateRejected(candidate: ConstraintCandidate): boolean {
    const entityKey = this.getCandidateKey(candidate);
    if (this.rejectionMemory.has(entityKey)) return true;
    const sigKey = this.getCandidateSignatureKey(candidate);
    if (sigKey && this.rejectionMemory.has(sigKey)) return true;
    return false;
  }

  /**
   * Checks whether a merged parameter card is suppressed by rejection memory.
   */
  public isCardRejected(card: MergedParameterCard): boolean {
    if (this.rejectionMemory.has(card.signature)) return true;
    // Check if any candidate within the card has been explicitly rejected
    return card.candidates.some((c) => this.isCandidateRejected(c));
  }

  /**
   * Filters out candidates previously rejected by the user.
   */
  public filterRejectedCandidates(candidates: ConstraintCandidate[]): ConstraintCandidate[] {
    return candidates.filter((c) => !this.isCandidateRejected(c));
  }

  /**
   * Filters out merged parameter cards previously rejected by the user.
   */
  public filterRejectedCards(cards: MergedParameterCard[]): MergedParameterCard[] {
    return cards.filter((c) => !this.isCardRejected(c));
  }

  /**
   * Records a user rejection for a specific candidate.
   */
  public rejectCandidate(candidate: ConstraintCandidate): void {
    const entityKey = this.getCandidateKey(candidate);
    this.rejectionMemory.add(entityKey);
    candidate.status = "rejected";
  }

  /**
   * Records a user rejection for a merged parameter card.
   * Persists the card's cluster signature and all constituent candidate entity keys.
   */
  public rejectCard(card: MergedParameterCard): void {
    this.rejectionMemory.add(card.signature);
    for (const cand of card.candidates) {
      this.rejectCandidate(cand);
    }
    card.status = "rejected";
    this.activeCards.delete(card.id);
  }

  /**
   * Records a direct signature or entity-key string into rejection memory.
   */
  public recordRejectionKey(key: string): void {
    this.rejectionMemory.add(key);
  }

  /**
   * Accepts a merged card, marking all constituent candidates as accepted.
   */
  public acceptCard(card: MergedParameterCard): void {
    card.status = "accepted";
    for (const cand of card.candidates) {
      cand.status = "accepted";
    }
    this.activeCards.set(card.id, card);
  }

  /**
   * Updates active cards with incoming candidate cards.
   * Superseded candidates (pending suggestions targeting the exact same entities or signatures
   * that have received newer metrics or geometry) cleanly replace pending suggestions.
   */
  public updateLifecycleCards(incomingCards: MergedParameterCard[]): {
    activeCards: MergedParameterCard[];
    supersededCards: MergedParameterCard[];
  } {
    // 1. Filter out rejected cards
    const filteredIncoming = this.filterRejectedCards(incomingCards);

    // 2. For each incoming card, check if it supersedes an existing pending card
    for (const incCard of filteredIncoming) {
      const incEntitySet = new Set(incCard.entities);

      for (const [existingId, existingCard] of this.activeCards.entries()) {
        if (existingCard.id === incCard.id) continue;

        // Never supersede an already accepted card
        if (existingCard.status === "accepted") continue;

        // Check for signature match or exact entity match
        const sameSignature = existingCard.signature === incCard.signature;
        const exactEntitiesMatch =
          existingCard.predicate === incCard.predicate &&
          existingCard.entities.length === incCard.entities.length &&
          existingCard.entities.every((e) => incEntitySet.has(e));

        if (sameSignature || exactEntitiesMatch) {
          // Supersede the existing pending card
          existingCard.status = "superseded";
          for (const c of existingCard.candidates) {
            c.status = "superseded";
          }
          this.supersededCards.set(existingCard.id, existingCard);
          this.activeCards.delete(existingId);
        }
      }

      this.activeCards.set(incCard.id, incCard);
    }

    return {
      activeCards: Array.from(this.activeCards.values()),
      supersededCards: Array.from(this.supersededCards.values()),
    };
  }

  /**
   * Returns current active cards.
   */
  public getActiveCards(): MergedParameterCard[] {
    return Array.from(this.activeCards.values());
  }

  /**
   * Returns all superseded cards.
   */
  public getSupersededCards(): MergedParameterCard[] {
    return Array.from(this.supersededCards.values());
  }

  /**
   * Returns an array copy of all rejection keys recorded in the session.
   */
  public getRejectionKeys(): string[] {
    return Array.from(this.rejectionMemory);
  }

  /**
   * Restores rejection memory from a previously saved session.
   */
  public restoreRejections(keys: string[]): void {
    for (const k of keys) {
      this.rejectionMemory.add(k);
    }
  }

  /**
   * Clears rejection memory and card registries (e.g. when creating a new canvas).
   */
  public clear(): void {
    this.rejectionMemory.clear();
    this.activeCards.clear();
    this.supersededCards.clear();
  }
}

