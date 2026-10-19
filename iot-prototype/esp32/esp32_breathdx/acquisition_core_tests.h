#pragma once
namespace breathdx {
constexpr int GOOD[] = {1000, 1002, 1001};
constexpr int SPIKE[] = {1000, 3000, 1001};
constexpr int ZERO[] = {1000, 0, 1001};
constexpr int SATURATED[] = {1000, 4095, 1001};
constexpr int EVEN[] = {1000, 1003, 1002, 1001};
static_assert(validGas(1) && validGas(4094), "ADC accepted bounds");
static_assert(!validGas(0) && !validGas(4095), "ADC rails rejected");
static_assert(median(SPIKE, 3) == 1001, "Median filters a spike");
static_assert(median(EVEN, 4) == 1001, "Even median stays an integer count");
static_assert(validWindow(GOOD, 3, 2), "Stable baseline accepted");
static_assert(!validWindow(SPIKE, 3, 2), "Noisy baseline rejected");
static_assert(!validWindow(ZERO, 3, 4094), "Zero sample rejected");
static_assert(!validWindow(SATURATED, 3, 4094), "Saturation rejected");
static_assert(!validWindow(GOOD, 2, 2), "Incomplete burst rejected");
static_assert(validEnvironment(-40, 0) && validEnvironment(80, 100), "Environment bounds");
static_assert(!validEnvironment(81, 50) && !validEnvironment(25, -1), "Environment rejection");
static_assert(channelTriggered(1020, 1000, 1, 20), "Positive change boundary");
static_assert(channelTriggered(980, 1000, -1, 20), "Negative channel polarity");
static_assert(!channelTriggered(1020, 1000, 1, 0), "Unconfigured threshold disabled");
static_assert(!breathTriggered(1020, 1010, 1000, 1000, 1, 1, 20, 20, true), "Both-channel detection");
static_assert(breathTriggered(1020, 1010, 1000, 1000, 1, 1, 20, 20, false), "Either-channel detection");
static_assert(!breathTriggered(1020, 0, 1000, 1000, 1, 1, 20, 20, false), "Broken secondary never triggers");
static_assert(due(5, 0xfffffff0U) && !due(0xfffffff0U, 5), "Millis rollover");
}
