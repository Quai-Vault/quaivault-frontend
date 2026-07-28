import { describe, it, expect } from 'vitest';
import { diffModuleStatuses } from './moduleStatus';

const MODULE_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MODULE_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('diffModuleStatuses', () => {
  describe('first sight of a module', () => {
    it('records the status without announcing it', () => {
      const { changes, nextStatuses } = diffModuleStatuses({}, { [MODULE_A]: true });

      expect(changes).toEqual([]);
      expect(nextStatuses).toEqual({ [MODULE_A]: true });
    });

    it('records a newly appearing module alongside known ones', () => {
      const { changes, nextStatuses } = diffModuleStatuses(
        { [MODULE_A]: true },
        { [MODULE_A]: true, [MODULE_B]: false },
      );

      expect(changes).toEqual([]);
      expect(nextStatuses).toEqual({ [MODULE_A]: true, [MODULE_B]: false });
    });
  });

  describe('genuine transitions', () => {
    it('announces an enable', () => {
      const { changes } = diffModuleStatuses({ [MODULE_A]: false }, { [MODULE_A]: true });

      expect(changes).toEqual([{ moduleAddress: MODULE_A, isEnabled: true }]);
    });

    it('announces a disable', () => {
      const { changes } = diffModuleStatuses({ [MODULE_A]: true }, { [MODULE_A]: false });

      expect(changes).toEqual([{ moduleAddress: MODULE_A, isEnabled: false }]);
    });

    it('says nothing when the status is unchanged', () => {
      const { changes } = diffModuleStatuses({ [MODULE_A]: true }, { [MODULE_A]: true });

      expect(changes).toEqual([]);
    });

    it('reports each changed module independently', () => {
      const { changes } = diffModuleStatuses(
        { [MODULE_A]: true, [MODULE_B]: true },
        { [MODULE_A]: false, [MODULE_B]: true },
      );

      expect(changes).toEqual([{ moduleAddress: MODULE_A, isEnabled: false }]);
    });
  });

  describe('unknown status', () => {
    it('does not announce a disable when the check failed', () => {
      const { changes } = diffModuleStatuses({ [MODULE_A]: true }, { [MODULE_A]: null });

      expect(changes).toEqual([]);
    });

    it('keeps the last known value rather than forgetting it', () => {
      const { nextStatuses } = diffModuleStatuses({ [MODULE_A]: true }, { [MODULE_A]: null });

      expect(nextStatuses).toEqual({ [MODULE_A]: true });
    });

    it('never becomes the baseline a later reading is compared against', () => {
      // The exact sequence a transient RPC failure produces. Before this rule
      // it announced "disabled", then "enabled" again — two false alarms.
      const blip = diffModuleStatuses({ [MODULE_A]: true }, { [MODULE_A]: null });
      expect(blip.changes).toEqual([]);

      const recovered = diffModuleStatuses(blip.nextStatuses, { [MODULE_A]: true });
      expect(recovered.changes).toEqual([]);
    });

    it('still reports a real change that happened across an unknown gap', () => {
      const blip = diffModuleStatuses({ [MODULE_A]: true }, { [MODULE_A]: null });
      const afterwards = diffModuleStatuses(blip.nextStatuses, { [MODULE_A]: false });

      expect(afterwards.changes).toEqual([{ moduleAddress: MODULE_A, isEnabled: false }]);
    });

    it('does not block other modules in the same round', () => {
      const { changes } = diffModuleStatuses(
        { [MODULE_A]: true, [MODULE_B]: false },
        { [MODULE_A]: null, [MODULE_B]: true },
      );

      expect(changes).toEqual([{ moduleAddress: MODULE_B, isEnabled: true }]);
    });

    it('records nothing for a module only ever seen as unknown', () => {
      const { changes, nextStatuses } = diffModuleStatuses({}, { [MODULE_A]: null });

      expect(changes).toEqual([]);
      expect(nextStatuses).toEqual({});
    });
  });

  it('does not mutate the previous statuses it was given', () => {
    const prev = { [MODULE_A]: true };

    diffModuleStatuses(prev, { [MODULE_A]: false, [MODULE_B]: true });

    expect(prev).toEqual({ [MODULE_A]: true });
  });
});
