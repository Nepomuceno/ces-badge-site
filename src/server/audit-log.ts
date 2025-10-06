import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'

import { ensureDataDir, resolveDataPath } from './storage-utils'

const VOTE_EVENT_LOG = 'vote-events.ndjson'

interface VoteParticipantSnapshot {
  id: string
  name: string
  codename: string
  ratingBefore: number
  ratingAfter: number
  winsBefore: number
  winsAfter: number
  lossesBefore: number
  lossesAfter: number
  matchesBefore: number
  matchesAfter: number
}

export interface VoteRecordedEvent {
  id: string
  type: 'vote-recorded'
  occurredAt: string
  contestId: string
  voterHash: string | null
  matchTimestamp: number
  matchHistoryLength: number
  winner: VoteParticipantSnapshot
  loser: VoteParticipantSnapshot
}

export interface VotesResetEvent {
  id: string
  type: 'votes-reset'
  occurredAt: string
  contestId: string
  initiator: string | null
  reason: string
  previousMatchCount: number
}

export type VoteAuditEvent = VoteRecordedEvent | VotesResetEvent

async function appendAuditEvent(event: VoteAuditEvent): Promise<void> {
  await ensureDataDir()
  const filePath = resolveDataPath(VOTE_EVENT_LOG)
  const payload = `${JSON.stringify(event)}\n`
  await fs.appendFile(filePath, payload, 'utf-8')
}

export interface VoteRecordedLogInput {
  contestId: string
  voterHash: string | null
  matchTimestamp: number
  matchHistoryLength: number
  winner: VoteParticipantSnapshot
  loser: VoteParticipantSnapshot
}

export async function logVoteRecorded(input: VoteRecordedLogInput): Promise<void> {
  const event: VoteRecordedEvent = {
    id: randomUUID(),
    type: 'vote-recorded',
    occurredAt: new Date().toISOString(),
    contestId: input.contestId,
    voterHash: input.voterHash,
    matchTimestamp: input.matchTimestamp,
    matchHistoryLength: input.matchHistoryLength,
    winner: input.winner,
    loser: input.loser,
  }
  await appendAuditEvent(event)
}

export interface VotesResetLogInput {
  contestId: string
  initiator?: string | null
  reason: string
  previousMatchCount: number
}

export async function logVotesReset(input: VotesResetLogInput): Promise<void> {
  const event: VotesResetEvent = {
    id: randomUUID(),
    type: 'votes-reset',
    occurredAt: new Date().toISOString(),
    contestId: input.contestId,
    initiator: input.initiator ?? null,
    reason: input.reason,
    previousMatchCount: input.previousMatchCount,
  }
  await appendAuditEvent(event)
}
