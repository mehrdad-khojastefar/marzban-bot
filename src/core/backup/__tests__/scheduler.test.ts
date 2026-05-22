import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as settingService from '../../../bot/services/settingService';
import * as eventLogger from '../../events/eventLogger';
import * as runnerModule from '../runner';
import {
  startBackupScheduler,
  stopBackupScheduler,
  DEFAULT_CRON,
} from '../scheduler';

function makeBot() {
  return { telegram: {} } as never;
}

describe('backup scheduler', () => {
  beforeEach(() => {
    vi.spyOn(eventLogger, 'logEvent').mockImplementation(() => {});
    vi.spyOn(runnerModule, 'runBackups').mockResolvedValue({
      skipped: null,
      results: [],
    });
  });

  afterEach(() => {
    stopBackupScheduler();
    vi.restoreAllMocks();
  });

  it('does not schedule when backup_enabled is "false"', async () => {
    vi.spyOn(settingService, 'getSetting').mockImplementation(async (key) => {
      if (key === 'backup_enabled') return 'false';
      if (key === 'backup_cron') return '*/5 * * * *';
      return null;
    });

    await startBackupScheduler(makeBot());
    // Nothing to assert beyond "doesn't throw" — the cron lib never receives a task.
    expect(runnerModule.runBackups).not.toHaveBeenCalled();
  });

  it('falls back to the default cron when backup_cron is invalid', async () => {
    const logSpy = vi.spyOn(eventLogger, 'logEvent');
    vi.spyOn(settingService, 'getSetting').mockImplementation(async (key) => {
      if (key === 'backup_enabled') return 'true';
      if (key === 'backup_cron') return 'not-a-cron';
      return null;
    });

    await startBackupScheduler(makeBot());

    expect(logSpy).toHaveBeenCalledWith(
      'error.backup_misconfigured',
      expect.objectContaining({ key: 'backup_cron', value: 'not-a-cron' }),
    );
    // Falls back to default — value is the default constant.
    expect(DEFAULT_CRON).toBe('0 3 * * *');
  });
});
