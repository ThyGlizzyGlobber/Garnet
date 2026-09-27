import { describe, expect, it } from 'vitest';
import {
  addressOf,
  checkSender,
  isFreemail,
  isTrustedSender,
  parseSenderList,
  trustTarget,
} from '@/lib/sender-auth';
import { dkimKeys } from './helpers/dkim';

const { resolver, sign } = dkimKeys([
  'provider.com.au',
  'mail.provider.com.au',
  'attacker.example',
]);

const mail = (from: string) =>
  Buffer.from(
    [
      `From: ${from}`,
      'To: smith-7k2f@brjlabs.com',
      'Subject: Your bill',
      'Message-ID: <m1@provider.com.au>',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Amount due $10.00',
      '',
    ].join('\r\n'),
  );

describe('checkSender (DKIM aligned with From)', () => {
  it('verifies mail signed by the From domain', async () => {
    const signed = await sign(mail('Provider <billing@provider.com.au>'), 'provider.com.au');
    expect(await checkSender(signed, { resolver })).toEqual({
      fromDomain: 'provider.com.au',
      verified: true,
    });
  });

  it('accepts a signature from a subdomain of the same organisation', async () => {
    const signed = await sign(mail('billing@provider.com.au'), 'mail.provider.com.au');
    expect((await checkSender(signed, { resolver })).verified).toBe(true);
  });

  it('rejects a spoof: signed by the attacker, From the provider', async () => {
    const spoof = await sign(mail('Provider <billing@provider.com.au>'), 'attacker.example');
    expect(await checkSender(spoof, { resolver })).toEqual({
      fromDomain: 'provider.com.au',
      verified: false,
    });
  });

  it('rejects unsigned and altered mail', async () => {
    expect((await checkSender(mail('billing@provider.com.au'), { resolver })).verified).toBe(false);
    const signed = await sign(mail('billing@provider.com.au'), 'provider.com.au');
    const altered = Buffer.from(signed.toString().replace('$10.00', '$99.00'));
    expect((await checkSender(altered, { resolver })).verified).toBe(false);
  });

  it('never verifies a message with two From addresses', async () => {
    const two = await sign(
      mail('billing@provider.com.au, other@attacker.example'),
      'provider.com.au',
    );
    expect((await checkSender(two, { resolver })).verified).toBe(false);
  });
});

describe('trusted sender lists', () => {
  it('match the domain and its subdomains only', () => {
    expect(isTrustedSender('provider.com.au', ['provider.com.au'])).toBe(true);
    expect(isTrustedSender('mail.provider.com.au', ['provider.com.au'])).toBe(true);
    expect(isTrustedSender('evilprovider.com.au', ['provider.com.au'])).toBe(false);
    expect(isTrustedSender(null, ['provider.com.au'])).toBe(false);
  });

  it('are tidied from what people type', () => {
    expect(parseSenderList(' AussieBroadband.com.au, @agl.com.au;agl.com.au  nonsense ')).toEqual([
      'aussiebroadband.com.au',
      'agl.com.au',
    ]);
  });
});

describe('personal mailboxes', () => {
  it('are never trusted as a whole domain, only as an exact address', () => {
    expect(isTrustedSender('gmail.com', ['gmail.com'], 'anyone@gmail.com')).toBe(false);
    expect(isTrustedSender('gmail.com', ['me@gmail.com'], 'me@gmail.com')).toBe(true);
    expect(isTrustedSender('gmail.com', ['me@gmail.com'], 'you@gmail.com')).toBe(false);
    expect(trustTarget('gmail.com', 'me@gmail.com')).toBe('me@gmail.com');
    expect(trustTarget('agl.com.au', 'billing@agl.com.au')).toBe('agl.com.au');
    expect(isFreemail('bigpond.com')).toBe(true);
  });

  it('can be typed as addresses but not as domains', () => {
    expect(parseSenderList('gmail.com, Me@Gmail.com, agl.com.au')).toEqual([
      'me@gmail.com',
      'agl.com.au',
    ]);
  });

  it('parse the bare address from a From header', () => {
    expect(addressOf('"Jo Smith" <Jo@Example.com>')).toBe('jo@example.com');
    expect(addressOf('jo@example.com')).toBe('jo@example.com');
    expect(addressOf(null)).toBeNull();
  });
});
