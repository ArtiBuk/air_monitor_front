export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  is_active: boolean;
  is_staff: boolean;
}

export interface AuthSession {
  access_expires_at: string;
  refresh_expires_at: string;
  user: User;
}

export interface MessageResponse {
  detail: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface Observation {
  id: string;
  source: string;
  source_kind: string;
  station_id: string;
  station_name: string;
  lat: number | null;
  lon: number | null;
  observed_at_utc: string;
  time_bucket_utc: string | null;
  time_window_utc: string | null;
  metric: string;
  value: number | null;
  unit: string;
  extra: JsonObject;
}

export interface CollectObservationsPayload {
  start: string;
  finish: string;
  interval: string;
  window_hours: number;
  scheduled_for?: string | null;
}

export interface ObservationSyncResult {
  raw_count: number;
  cleaned_count: number;
  db_created_count: number;
  db_updated_count: number;
}

export interface AirMapBounds {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
  center_lat: number;
  center_lon: number;
}

export interface AirMapStationPoint {
  station_id: string;
  station_name: string;
  lat: number;
  lon: number;
  observed_at_utc: string;
  value: number | null;
  unit: string;
  source: string;
  source_kind: string;
  extra: JsonObject;
}

export interface AirMapMetricSnapshot {
  metric: string;
  value: number | null;
  unit: string;
  observed_at_utc: string;
  source: string;
  station_name: string;
  extra: JsonObject;
}

export interface AirMapSummary {
  latest_station_timestamp: string | null;
  latest_city_timestamp: string | null;
  station_count: number;
  city_metric_count: number;
  sources: string[];
}

export interface AirMapSnapshot {
  summary: AirMapSummary;
  bounds: AirMapBounds | null;
  station_points: AirMapStationPoint[];
  city_metrics: AirMapMetricSnapshot[];
}

export interface MonitoringOverviewCounts {
  observations: number;
  datasets: number;
  models: number;
  forecasts: number;
  experiments: number;
  series: number;
  scheduled_tasks: number;
}

export interface AutomaticCollectionConfig {
  lookback_hours: number;
  interval: string;
  window_hours: number;
  schedule_minute: number;
  enabled_sources: string[];
}

export interface MonitoringOverview {
  counts: MonitoringOverviewCounts;
  automatic_collection: AutomaticCollectionConfig;
}

export interface DatasetSnapshot {
  id: string;
  input_len_hours: number;
  forecast_horizon_hours: number;
  master_row_count: number;
  sample_count: number;
  feature_columns: string[];
  target_columns: string[];
  metadata: JsonObject;
  created_at: string;
}

export interface BuildDatasetPayload {
  input_len_hours: number;
  forecast_horizon_hours: number;
  feature_columns: string[] | null;
  target_columns: string[] | null;
  scheduled_for?: string | null;
}

export interface ModelVersion {
  id: string;
  dataset: string | null;
  name: string;
  status: string;
  input_len_hours: number;
  forecast_horizon_hours: number;
  feature_names: string[];
  target_names: string[];
  training_config: JsonObject;
  metrics: JsonObject;
  history: JsonObject;
  error_message: string;
  is_active: boolean;
  created_at: string;
}

export interface TrainModelPayload {
  dataset_snapshot_id: string | null;
  epochs: number;
  batch_size: number;
  lr: number;
  weight_decay: number;
  patience: number;
  seed: number;
  scheduled_for?: string | null;
}

export interface ModelLeaderboardEntry {
  rank: number;
  model_version_id: string;
  model_name: string;
  evaluation_count: number;
  avg_overall_rmse: number | null;
  avg_overall_mae: number | null;
  avg_macro_mape: number | null;
  avg_coverage_ratio: number | null;
  forecast_horizon_hours: number;
  input_len_hours: number;
  is_active: boolean;
  dataset_sample_count: number;
  dataset_master_row_count: number;
  metric_source: "backtest" | "training";
  latest_evaluated_at_utc: string | null;
}

export interface ForecastRecord {
  id: string;
  timestamp_utc: string;
  values: Record<string, number>;
}

export interface ForecastRun {
  id: string;
  model_version: string | null;
  status: string;
  generated_from_timestamp_utc: string | null;
  forecast_horizon_hours: number;
  created_at: string;
  error_message: string;
  metadata: JsonObject;
  records: ForecastRecord[];
}

export interface ForecastGeneratePayload {
  input_len_hours: number;
  forecast_horizon_hours: number;
  model_version_id: string | null;
  generated_from_timestamp_utc: string | null;
  scheduled_for?: string | null;
}

export interface ForecastEvaluation {
  id: string;
  forecast_run: string;
  status: string;
  expected_record_count: number;
  matched_record_count: number;
  coverage_ratio: number;
  evaluated_at_utc: string | null;
  metrics: JsonObject;
  error_message: string;
  created_at: string;
}

export interface ExperimentDatasetConfig {
  input_len_hours: number;
  forecast_horizon_hours: number;
  feature_columns: string[] | null;
  target_columns: string[] | null;
}

export interface ExperimentTrainingConfig {
  epochs: number;
  batch_size: number;
  lr: number;
  weight_decay: number;
  patience: number;
  seed: number;
}

export interface ExperimentBacktestConfig {
  generated_from_timestamp_utc: string | null;
}

export interface RunExperimentPayload {
  name: string;
  series_id: string | null;
  dataset: ExperimentDatasetConfig;
  training: ExperimentTrainingConfig;
  backtest: ExperimentBacktestConfig | null;
  scheduled_for?: string | null;
}

export interface ExperimentRun {
  id: string;
  series: string | null;
  name: string;
  status: string;
  dataset_snapshot: string | null;
  model_version: string | null;
  forecast_run: string | null;
  forecast_evaluation: string | null;
  input_len_hours: number;
  forecast_horizon_hours: number;
  feature_columns: string[];
  target_columns: string[];
  training_config: JsonObject;
  backtest_config: JsonObject;
  summary: JsonObject;
  error_message: string;
  created_at: string;
}

export interface ExperimentSeriesConfiguration {
  goal?: string;
  dataset?: ExperimentDatasetConfig | null;
  training?: ExperimentTrainingConfig | null;
  backtest?: ExperimentBacktestConfig | null;
  metadata?: JsonObject | null;
}

export interface CreateExperimentSeriesPayload {
  name: string;
  description: string;
  configuration: ExperimentSeriesConfiguration | null;
}

export interface ExperimentSeries {
  id: string;
  name: string;
  description: string;
  status: string;
  configuration: JsonObject;
  summary: JsonObject;
  created_at: string;
}

export interface ExperimentSeriesReportAggregates {
  run_count: number;
  completed_run_count: number;
  failed_run_count: number;
  latest_experiment_run_id: string | null;
  best_experiment_run_id: string | null;
  best_backtest_overall_rmse: number | null;
  avg_training_overall_rmse: number | null;
  avg_backtest_overall_rmse: number | null;
  avg_backtest_overall_mae: number | null;
  avg_backtest_macro_mape: number | null;
}

export interface ExperimentSeriesReport {
  series: ExperimentSeries;
  runs: ExperimentRun[];
  aggregates: ExperimentSeriesReportAggregates;
}

export interface AsyncTaskLaunch {
  task_id: string;
  status: string;
  operation: string;
  scheduled_task_id: string | null;
  scheduled_for: string | null;
  is_scheduled: boolean;
}

export interface AsyncTaskStatus {
  task_id: string;
  status: string;
  ready: boolean;
  successful: boolean;
  result: JsonValue | null;
  error: string | null;
}

export interface ScheduledTask {
  id: string;
  operation: string;
  status: string;
  scheduled_for: string;
  celery_task_id: string;
  payload: JsonObject;
  result: JsonValue | null;
  error: string;
  requested_by_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}
