export function estimationMessage(reading) {
  if (reading.is_simulated) return 'Synthetic test data; glucose estimation is disabled.';
  if (reading.estimation_status === 'available_experimental') return 'Experimental model output; not medically validated.';
  if (!reading.estimation_status) return '';
  if (reading.estimation_reason === 'outside_training_domain') return 'Estimate unavailable: outside the evaluated input range.';
  if (reading.estimation_reason === 'missing_model_features') return 'Estimate unavailable: required baseline measurements are missing.';
  return 'Estimate unavailable: no approved, compatible model is active for this reading.';
}
