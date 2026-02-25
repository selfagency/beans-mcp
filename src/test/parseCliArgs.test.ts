import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCliArgs } from '../server/BeansMcpServer';

describe('parseCliArgs', () => {
  it('should parse workspace root positional argument', () => {
    const result = parseCliArgs(['/workspace']);
    expect(result.workspaceRoot).toBe('/workspace');
    expect(result.cliPath).toBe('beans');
    expect(result.workspaceExplicit).toBe(true);
  });

  it('should parse --workspace-root flag', () => {
    const result = parseCliArgs(['--workspace-root', '/workspace']);
    expect(result.workspaceRoot).toBe('/workspace');
    expect(result.workspaceExplicit).toBe(true);
  });

  it('should mark workspaceExplicit false when no workspace arg given', () => {
    const result = parseCliArgs([]);
    expect(result.workspaceExplicit).toBe(false);
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

  describe('--help / -h', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('--help writes help text to stdout and exits with 0', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number) => never);

      parseCliArgs(['--help']);

      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Usage'));
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('-h writes help text to stdout and exits with 0', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number) => never);

      parseCliArgs(['-h']);

      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Usage'));
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });
});
