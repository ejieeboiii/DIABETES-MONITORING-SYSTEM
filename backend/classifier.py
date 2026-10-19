import math
# Legacy MQ-138 prototype processing only; never use these constants for TGS sensors.
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
    if not 0 < raw_adc < ADC_MAX:
        raise ValueError("ADC must be between 1 and 4094; zero or saturation is invalid.")
    if not math.isfinite(temperature) or not -40 <= temperature <= 80:
        raise ValueError("Temperature must be finite and between -40 and 80 °C.")
    if not math.isfinite(humidity) or not 0 <= humidity <= 100:
        raise ValueError("Humidity must be finite and between 0 and 100 percent.")
    if baseline_adc is not None and not 0 <= baseline_adc < ADC_MAX:
        raise ValueError("Baseline ADC must be between 0 and 4094.")
    adc = effective_adc(raw_adc, baseline_adc)
    if adc <= 0:
        raise ValueError("No positive signal above baseline.")
    voltage = adc * (VCC / ADC_MAX)
    if voltage >= VCC:
        raise ValueError("ADC signal is saturated.")
    rs = ((VCC - voltage) / voltage) * RL_VALUE
    compensation = 1.0 + ((humidity - 50) * 0.01) + ((temperature - 25) * 0.005)
    if not math.isfinite(compensation) or compensation <= 0:
        raise ValueError("Invalid environmental compensation.")
    rs_compensated = rs / compensation
    ratio = rs_compensated / R0
    if ratio <= 0:
        raise ValueError("Invalid resistance ratio.")
    ppm = math.pow(10, (-1.52 * math.log10(ratio) + 0.8))
    if not math.isfinite(ppm) or ppm <= 0:
        raise ValueError("Invalid calculated concentration.")
    rounded = round(ppm, 4)
    if rounded <= 0:
        raise ValueError("Signal is below the conversion's reporting resolution.")
    return rounded

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
        "Normal": "This reading falls in the prototype's normal monitoring band. It does not confirm normal blood glucose or rule out diabetes. Continue monitoring as agreed with your provider.",
        "Pre-Diabetic": "This reading falls in the prototype's elevated monitoring band. Share the reading with your provider; this band does not diagnose pre-diabetes. Do not change treatment based on this result.",
        "Diabetic": "This reading falls in the prototype's high monitoring band. Contact your provider for interpretation and validated blood glucose measurement. This band does not diagnose diabetes or ketosis."
    }
    return suggestions.get(level, "Please consult your medical personnel.")
