/**
 * 대본: the 빙고 1등 chooses the first stone. The remote hands them that first
 * choice once per 스톤 game. Module-level, because the remote remounts on every
 * step; the full 스톤 console clears it whenever a game is back in setup.
 */
let done = false;

export const autoGuest = {
  pending: () => !done,
  markDone: () => {
    done = true;
  },
  reset: () => {
    done = false;
  },
};
