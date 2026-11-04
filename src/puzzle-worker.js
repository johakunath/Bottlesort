import { VesselLogic as Logic } from './game-logic.js';
self.onmessage = ({ data: { task, payload } }) => {
  try {
    const result = task === 'solve'
      ? Logic.solve(Logic.withCapacities(payload.state, payload.capacities), payload.budget, new Set(payload.frozen))
      : Logic.generateFromSeed(payload.seed, payload.colors, payload.sets, payload.empties, undefined, payload.towerCap);
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error.message }); }
};
