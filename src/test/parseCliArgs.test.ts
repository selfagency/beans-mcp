import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../server/BeansMcpServer';

describe('parseCliArgs', () => {
  it('should parse workspace root positional argument', () => {
    const result = parseCliArgs(['/workspace']);
    expect(result.workspaceRoot).toBe('/workspace');
    expect(result.cliPath).toBe('beans');
  });

  it('should parse --workspace-root flag', () => {
    const result = parseCliArgs(['--workspace-root', '/workspace']);
    expect(result.workspaceRoot).toBe('/workspace');
  });

  it('should parse --cli-path flag', () => {
    const result = parseCliArgs(['--cli-path', '/usr/local/bin/beans']);
    expect(result.cliPath).toBe('/usr/local/bin/beans');
  });

  it('should parse --port flag', () => {
    const result = parseCliArgs(['--port', '8080']);
    expect(result.port).toBe(8080);
  });

  it('should parse --log-dir flag', () => {
    const result = parseCliArgs(['--log-dir', '/tmp/logs']);
    expect(result.logDir).toBe('/tmp/logs');
  });

  it('should reject suspicious CLI paths', () => {
    expect(() => {
      parseCliArgs(['--cli-path', 'beans; rm -rf /']);
    }).toThrow('Invalid CLI path');
  });
});
