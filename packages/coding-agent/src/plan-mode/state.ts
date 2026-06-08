export interface PlanModeState {
	enabled: boolean;
	planFilePath: string;
	workflow?: "parallel" | "iterative";
	reentry?: boolean;
	/** Ordered list of stage file URLs (e.g. ['local://stage-1.md']). */
	stagePaths?: string[];
}
