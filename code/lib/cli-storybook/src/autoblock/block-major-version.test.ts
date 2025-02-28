import { describe, expect, it, vi } from 'vitest';

import { versions } from 'storybook/internal/common';

import { blocker, checkUpgrade } from './block-major-version';

vi.mock('storybook/internal/common', () => ({
  versions: {
    storybook: '8.0.0',
  },
}));

describe('checkUpgrade', () => {
  it('invalid versions - returns ok for empty or invalid versions', () => {
    expect(checkUpgrade('', '8.0.0')).toBe('ok');
    expect(checkUpgrade('7.0.0', '')).toBe('ok');
    expect(checkUpgrade('invalid', '8.0.0')).toBe('ok');
    expect(checkUpgrade('7.0.0', 'invalid')).toBe('ok');
  });

  it('prerelease - allows upgrades from any prerelease version', () => {
    expect(checkUpgrade('6.0.0-canary.1', '8.0.0')).toBe('ok');
    expect(checkUpgrade('6.0.0-alpha.0', '8.0.0')).toBe('ok');
    expect(checkUpgrade('6.0.0-beta.1', '8.0.0')).toBe('ok');
    expect(checkUpgrade('6.0.0-rc.1', '8.0.0')).toBe('ok');
    expect(checkUpgrade('0.0.0-bla-0', '8.0.0')).toBe('ok');
  });

  it('prerelease - allows upgrades to any prerelease version', () => {
    expect(checkUpgrade('6.0.0', '8.0.0-alpha.1')).toBe('ok');
    expect(checkUpgrade('6.0.0', '8.0.0-canary.0')).toBe('ok');
    expect(checkUpgrade('6.0.0', '8.0.0-beta.1')).toBe('ok');
    expect(checkUpgrade('6.0.0', '8.0.0-rc.0')).toBe('ok');
    expect(checkUpgrade('6.0.0', '0.0.0-bla-0')).toBe('ok');
  });

  it('prerelease - allows downgrades to and from prereleases', () => {
    expect(checkUpgrade('8.0.0', '6.0.0-alpha.1')).toBe('ok');
    expect(checkUpgrade('8.0.0-beta.1', '6.0.0')).toBe('ok');
    expect(checkUpgrade('8.0.0-rc.1', '6.0.0-alpha.1')).toBe('ok');
  });

  it('upgrade - allows upgrades one major version apart', () => {
    expect(checkUpgrade('6.0.0', '7.0.0')).toBe('ok');
    expect(checkUpgrade('7.0.0', '8.0.0')).toBe('ok');
    expect(checkUpgrade('6.5.0', '7.0.0')).toBe('ok');
  });

  it('upgrade - detects gaps more than one major version apart', () => {
    expect(checkUpgrade('6.0.0', '8.0.0')).toBe('gap-too-large');
    expect(checkUpgrade('5.0.0', '7.0.0')).toBe('gap-too-large');
    expect(checkUpgrade('6.5.0', '8.0.0')).toBe('gap-too-large');
  });

  it('downgrade - detects all downgrades between stable versions', () => {
    expect(checkUpgrade('7.0.0', '6.0.0')).toBe('downgrade');
    expect(checkUpgrade('8.0.0', '7.0.0')).toBe('downgrade');
    expect(checkUpgrade('7.5.0', '6.0.0')).toBe('downgrade');
    expect(checkUpgrade('8.0.0', '6.0.0')).toBe('downgrade');
    expect(checkUpgrade('7.0.0', '5.0.0')).toBe('downgrade');
    expect(checkUpgrade('8.5.0', '6.0.0')).toBe('downgrade');
  });

  it('special - allows any version zero upgrades or downgrades', () => {
    expect(checkUpgrade('0.1.0', '8.0.0')).toBe('ok');
    expect(checkUpgrade('6.0.0', '0.1.0')).toBe('ok');
    expect(checkUpgrade('0.0.1', '0.0.2')).toBe('ok');
  });

  it('special - handles upgrades to current CLI version (8.0.0)', () => {
    // Detects multi-major gaps
    expect(checkUpgrade('6.0.0', '8.0.0')).toBe('gap-too-large');
    expect(checkUpgrade('5.0.0', '8.0.0')).toBe('gap-too-large');

    // Allows single major and same version
    expect(checkUpgrade('7.0.0', '8.0.0')).toBe('ok');
    expect(checkUpgrade('8.0.0', '8.0.0')).toBe('ok');

    // Allows any prerelease
    expect(checkUpgrade('6.0.0-canary.1', '8.0.0')).toBe('ok');
    expect(checkUpgrade('6.0.0-alpha.0', '8.0.0')).toBe('ok');
    expect(checkUpgrade('6.0.0-beta.1', '8.0.0')).toBe('ok');
    expect(checkUpgrade('6.0.0-rc.0', '8.0.0')).toBe('ok');
  });
});

describe('blocker', () => {
  const mockPackageManager = {
    retrievePackageJson: vi.fn(),
  };

  it('check - returns false if no version found', async () => {
    mockPackageManager.retrievePackageJson.mockResolvedValue({});
    const result = await blocker.check({ packageManager: mockPackageManager } as any);
    expect(result).toBe(false);
  });

  it('check - returns false if version check fails', async () => {
    mockPackageManager.retrievePackageJson.mockRejectedValue(new Error('test'));
    const result = await blocker.check({ packageManager: mockPackageManager } as any);
    expect(result).toBe(false);
  });

  it('check - returns version data with reason if upgrade should be blocked', async () => {
    mockPackageManager.retrievePackageJson.mockResolvedValue({
      dependencies: {
        '@storybook/react': '6.0.0',
      },
    });
    const result = await blocker.check({ packageManager: mockPackageManager } as any);
    expect(result).toEqual({
      currentVersion: '6.0.0',
      reason: 'gap-too-large',
    });
  });

  describe('log', () => {
    it('includes upgrade command for gap-too-large', () => {
      const message = blocker.log({ packageManager: mockPackageManager } as any, {
        currentVersion: '6.0.0',
        reason: 'gap-too-large',
      });
      expect(message).toContain('You can upgrade to version 7 by running:');
      expect(message).toContain('npx storybook@7 upgrade');
      expect(message).toContain('Major Version Gap Detected');
    });

    it('shows downgrade message for downgrade attempts', () => {
      const message = blocker.log({ packageManager: mockPackageManager } as any, {
        currentVersion: '8.0.0',
        reason: 'downgrade',
      });
      expect(message).toContain('Downgrade Not Supported');
      expect(message).toContain('Creating a new project with the desired Storybook version');
      expect(message).not.toContain('You can upgrade to version');
    });

    it('omits upgrade command for invalid versions', () => {
      const message = blocker.log({ packageManager: mockPackageManager } as any, {
        currentVersion: 'invalid',
        reason: 'gap-too-large',
      });
      expect(message).not.toContain('You can upgrade to version');
      expect(message).toContain('Major Version Gap Detected');
      expect(message).toContain('For more information about upgrading');
    });
  });
});
