import { ImapFlow } from 'imapflow';
import fs from 'node:fs';
import path from 'node:path';
import { getEnv, isImapConfigured } from '@/lib/env';
import { ensureDataDirs } from '@/lib/paths';
import { primaryHousehold } from '@/lib/households';
import { ingestEmail } from '../email';
import type { PipelineOutcome } from '../pipeline';

export interface PollResult {
  startedAt: string;
  finishedAt: string;
  messagesSeen: number;
  documentsArchived: number;
  outcomes: PipelineOutcome[];
  error?: string;
}

interface ImapState {
  /** Highest UID processed per mailbox+account, so restarts don't reprocess. */
  lastUid: number;
  uidValidity?: number;
}

function statePath(): string {
  return path.join(ensureDataDirs().config, 'imap-state.json');
}

export function readImapState(): ImapState {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8')) as ImapState;
  } catch {
    return { lastUid: 0 };
  }
}

function writeImapState(state: ImapState) {
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
}

/**
 * One poll: fetch messages newer than the last processed UID, archive each
 * message (.eml) plus every PDF attachment, and run the pipeline on the
 * attachments (or the HTML/text body when there are none).
 */
export async function pollMailbox(): Promise<PollResult> {
  const env = getEnv();
  const startedAt = new Date().toISOString();
  const result: PollResult = {
    startedAt,
    finishedAt: startedAt,
    messagesSeen: 0,
    documentsArchived: 0,
    outcomes: [],
  };
  if (!isImapConfigured(env)) {
    result.error = 'IMAP not configured';
    result.finishedAt = new Date().toISOString();
    return result;
  }
  // The operator's mailbox delivers to the install's first household until
  // households get their own bills addresses.
  const target = primaryHousehold();
  if (!target) {
    result.error = 'No household set up yet';
    result.finishedAt = new Date().toISOString();
    return result;
  }
  const hid = target.id;
  const client = new ImapFlow({
    host: env.IMAP_HOST!,
    port: env.IMAP_PORT,
    secure: env.IMAP_SECURE,
    auth: { user: env.IMAP_USER!, pass: env.IMAP_PASSWORD! },
    logger: false,
  });
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(env.IMAP_MAILBOX);
    const state = readImapState();
    if (state.uidValidity !== undefined && state.uidValidity !== Number(mailbox.uidValidity))
      state.lastUid = 0;
    state.uidValidity = Number(mailbox.uidValidity);
    const uids = (await client.search({ uid: `${state.lastUid + 1}:*` }, { uid: true })) || [];
    const fresh = uids.filter((u) => u > state.lastUid).sort((a, b) => a - b);
    for (const uid of fresh) {
      const msg = await client.fetchOne(
        String(uid),
        { source: true, envelope: true, internalDate: true },
        { uid: true },
      );
      if (!msg || !msg.source) continue;
      result.messagesSeen++;
      const receivedAt = new Date(msg.internalDate ?? Date.now()).toISOString();
      const ingested = await ingestEmail(hid, msg.source, receivedAt);
      result.documentsArchived += ingested.archived;
      result.outcomes.push(...ingested.outcomes);
      state.lastUid = uid;
      writeImapState(state);
    }
  } catch (e) {
    result.error = (e as Error).message;
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
  result.finishedAt = new Date().toISOString();
  return result;
}
