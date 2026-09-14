import math
from typing import Optional, Tuple

RL_VALUE = 10.0
R0 = 10.0
ADC_MAX = 4095
VCC = 3.3

NORMAL_MAX = 1.8
PRE_DIABETIC_MAX = 3.5

# Minimum ADC rise above baseline to count as a breath (tune with Serial Monitor)
MIN_BREATH_DELTA_ADC = 50


def effective_adc(raw_adc: int, baseline_adc: Optional[int] = None) -> int:
    """Use breath peak minus clean-air baseline so room air does not dominate."""
    if baseline_adc is not None and baseline_adc > 0:
        return max(0, raw_adc - baseline_adc)
    return max(0, raw_adc)


def validate_breath_signal(raw_adc: int, baseline_adc: Optional[int] = None) -> Tuple[bool, str]:
    if baseline_adc is None:
        return True, ""
    delta = raw_adc - baseline_adc
    if delta < MIN_BREATH_DELTA_ADC:
        return (
            False,
            f"No clear breath detected (rise {delta} ADC, need ≥{MIN_BREATH_DELTA_ADC}). "
            "Hold sensor 2–3 cm from lips and exhale steadily for 5–8 seconds.",
        )
    return True, ""


def raw_to_ppm(
    raw_adc: int,
    temperature: float,
    humidity: float,
    baseline_adc: Optional[int] = None,
) -> float:
    adc = effective_adc(raw_adc, baseline_adc)
    if adc <= 0:
        return 0.0
    voltage = adc * (VCC / ADC_MAX)
    if voltage >= VCC:
        return 0.0
    rs = ((VCC - voltage) / voltage) * RL_VALUE
    compensation = 1.0 + ((humidity - 50) * 0.01) + ((temperature - 25) * 0.005)
    rs_compensated = rs / compensation
    ratio = rs_compensated / R0
    if ratio <= 0:
        return 0.0
    ppm = math.pow(10, (-1.52 * math.log10(ratio) + 0.8))
    return round(max(0.0, ppm), 4)

def classify_diabetes_level(acetone_ppm: float) -> str:
    if acetone_ppm < NORMAL_MAX:
        return "Normal"
    elif acetone_ppm < PRE_DIABETIC_MAX:
        return "Pre-Diabetic"
    else:
        return "Diabetic"

def get_level_color(level: str) -> str:
    return {"Normal": "green", "Pre-Diabetic": "yellow", "Diabetic": "red"}.get(level, "gray")

def get_health_suggestion(level: str) -> str:
    suggestions = {
        "Normal": "Your acetone levels are within the normal range. Maintain a healthy lifestyle, balanced diet, and regular exercise. Continue monitoring periodically.",
        "Pre-Diabetic": "Elevated acetone levels detected. This may indicate early metabolic changes. Please reduce sugar and carbohydrate intake, increase physical activity, and consult your medical personnel for blood glucose testing. This system is for monitoring purposes only.",
        "Diabetic": "High acetone levels detected. This may indicate poor glucose control or early ketosis. Please consult your medical personnel immediately for proper evaluation. This system is for health monitoring purposes only and is not a substitute for medical diagnosis."
    }
    return suggestions.get(level, "Please consult your medical personnel.")