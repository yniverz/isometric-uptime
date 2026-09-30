import { create } from 'zustand';

/**
 * Fast-changing UI state lives in its own small stores: updating the main
 * store re-runs every health selector in the scene, which is far too costly
 * for things that change on every mouse move or zoom step.
 */
export const useHover = create<{ hover: { id: string; x: number; y: number } | null }>(() => ({ hover: null }));

/** 1 / camera scale at the current focus; keeps labels a constant screen size. */
export const useView = create<{ labelScale: number }>(() => ({ labelScale: 1 }));
