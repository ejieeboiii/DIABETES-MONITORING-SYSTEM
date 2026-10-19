#pragma once
#include <stdint.h>

// Pure acquisition checks: ADC counts only, no gas/glucose conversion.
namespace breathdx {
constexpr int MAX_SAMPLES = 128;
constexpr bool validGas(int value) { return value > 0 && value < 4095; }
constexpr bool validEnvironment(float temperature, float humidity) {
  return temperature >= -40 && temperature <= 80 && humidity >= 0 && humidity <= 100;
}
constexpr int median(const int* input, int count) {
  if (count < 1 || count > MAX_SAMPLES) return -1;
  int sorted[MAX_SAMPLES] = {};
  for (int i = 0; i < count; ++i) sorted[i] = input[i];
  for (int i = 1; i < count; ++i) {
    int value = sorted[i], j = i;
    while (j > 0 && sorted[j - 1] > value) { sorted[j] = sorted[j - 1]; --j; }
    sorted[j] = value;
  }
  return count % 2 ? sorted[count / 2] : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;
}
constexpr bool validWindow(const int* samples, int count, int maximumSpan) {
  if (count < 3 || count > MAX_SAMPLES || maximumSpan < 0) return false;
  int low = 4095, high = 0;
  for (int i = 0; i < count; ++i) {
    if (!validGas(samples[i])) return false;
    if (samples[i] < low) low = samples[i];
    if (samples[i] > high) high = samples[i];
  }
  return high - low <= maximumSpan;
}
constexpr bool channelTriggered(int sample, int baseline, int direction, int delta) {
  return validGas(sample) && validGas(baseline) && delta > 0 &&
    (direction == 1 || direction == -1) && direction * (sample - baseline) >= delta;
}
constexpr bool breathTriggered(int primary, int secondary, int basePrimary, int baseSecondary,
                              int directionPrimary, int directionSecondary,
                              int deltaPrimary, int deltaSecondary, bool requireBoth) {
  // Reject either broken channel even when the configured detection rule uses OR.
  if (!validGas(primary) || !validGas(secondary)) return false;
  bool a = channelTriggered(primary, basePrimary, directionPrimary, deltaPrimary);
  bool b = channelTriggered(secondary, baseSecondary, directionSecondary, deltaSecondary);
  return requireBoth ? a && b : a || b;
}
constexpr bool due(uint32_t now, uint32_t deadline) { return int32_t(now - deadline) >= 0; }
}

#ifdef BREATHDX_COMPILE_SELF_TESTS
#include "acquisition_core_tests.h"
#endif
