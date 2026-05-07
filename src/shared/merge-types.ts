export interface MergeVideoSegment {
  sourcePath: string
  name: string
  duration: number
  mergedOffset: number
}

export interface MergeProgress {
  status: 'pending' | 'merging' | 'done' | 'error' | 'cancelled'
  percent: number
  stepLabel: string
  currentStep: number
  totalSteps: number
}

export interface MergeResult {
  success: boolean
  mergedPath?: string
  segments?: MergeVideoSegment[]
  error?: string
}
