"""Versioned raw-count preprocessing, with no chemical concentration conversion."""
import hashlib
import json
from pathlib import Path
from statistics import median
from typing import Literal
from pydantic import BaseModel, Field, model_validator
from schemas import SensorData
from settings import get_setting

VERSION = "tgs-adc-v1"
FEATURES = ["tgs822_normalized", "tgs2620_normalized", "temperature_c", "humidity_percent",
            "tgs822_baseline_normalized", "tgs2620_baseline_normalized"]
UNITS = dict(zip(FEATURES, ["fraction_of_12bit_full_scale", "fraction_of_12bit_full_scale", "degC", "percent",
                          "fraction_of_12bit_full_scale", "fraction_of_12bit_full_scale"]))


class EnvironmentalCorrection(BaseModel):
    """Explicit empirical linear correction in ADC counts, never PPM."""
    method: Literal["linear_adc_environment"]
    evidence_reference: str = Field(min_length=1, max_length=500)
    experimentally_reviewed: Literal[True]
    reference_temperature_c: float = Field(ge=-40, le=80, allow_inf_nan=False, strict=True)
    reference_humidity_percent: float = Field(ge=0, le=100, allow_inf_nan=False, strict=True)
    counts_per_celsius: float = Field(allow_inf_nan=False, strict=True)
    counts_per_humidity_percent: float = Field(allow_inf_nan=False, strict=True)
    model_config = {"extra": "forbid", "str_strip_whitespace": True}


class SensorCalibration(BaseModel):
    sensor_type: Literal["TGS822", "TGS2620"]
    sensor_identifier: str = Field(min_length=1, max_length=100)
    baseline_adc: int | None = Field(default=None, ge=0, le=4094, strict=True)
    environmental_correction: EnvironmentalCorrection | None = None
    model_config = {"extra": "forbid", "str_strip_whitespace": True}


class CalibrationProfile(BaseModel):
    profile_id: str = Field(min_length=1, max_length=100)
    calibration_version: str = Field(min_length=1, max_length=100)
    preprocessing_version: Literal["tgs-adc-v1"] = VERSION
    adc_resolution_bits: Literal[12] = 12
    measurement_units: Literal["raw_adc_counts"] = "raw_adc_counts"
    acquisition_protocol_reference: str = Field(min_length=1, max_length=500)
    evidence_reference: str | None = Field(default=None, min_length=1, max_length=500)
    temperature_domain_c: tuple[float, float]
    humidity_domain_percent: tuple[float, float]
    tgs822: SensorCalibration
    tgs2620: SensorCalibration
    model_config = {"extra": "forbid", "str_strip_whitespace": True, "allow_inf_nan": False}

    @model_validator(mode="after")
    def check_domains(self):
        if self.tgs822.sensor_type != "TGS822" or self.tgs2620.sensor_type != "TGS2620":
            raise ValueError("Sensor-specific profiles cannot be interchanged.")
        if self.tgs822.sensor_identifier == self.tgs2620.sensor_identifier:
            raise ValueError("Sensor identifiers must be distinct.")
        for domain, limits in ((self.temperature_domain_c, (-40, 80)), (self.humidity_domain_percent, (0, 100))):
            if not limits[0] <= domain[0] <= domain[1] <= limits[1]:
                raise ValueError("Invalid documented environmental domain.")
        return self


def profile_digest(profile: CalibrationProfile | None) -> str | None:
    if profile is None:
        return None
    return hashlib.sha256(json.dumps(profile.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def load_profile() -> CalibrationProfile | None:
    configured = get_setting("BREATHDX_TGS_CALIBRATION_PATH")
    if not configured:
        return None
    path = Path(configured)
    if not path.is_absolute():
        path = Path(__file__).parent / path
    return CalibrationProfile.model_validate_json(path.read_bytes())


def preprocess(data: SensorData | dict, profile: CalibrationProfile | None = None, *, simulated: bool = False) -> dict:
    # Revalidate even an instance modified/constructed outside the HTTP schema.
    data = SensorData.model_validate(data.model_dump() if isinstance(data, SensorData) else data)
    if data.sensor_configuration != "tgs822_tgs2620":
        raise ValueError("TGS preprocessing cannot consume MQ-138 measurements.")
    # Synthetic tests never use physical calibration settings or coefficients.
    if simulated:
        profile = None
    if profile and not (profile.temperature_domain_c[0] <= data.temperature <= profile.temperature_domain_c[1]
                        and profile.humidity_domain_percent[0] <= data.humidity <= profile.humidity_domain_percent[1]):
        raise ValueError("Environment is outside the configured calibration domain.")
    features = {"temperature_c": data.temperature, "humidity_percent": data.humidity}
    sensors = {}
    for name in ("tgs822", "tgs2620"):
        raw = getattr(data, name + "_raw_adc")
        samples = getattr(data, name + "_samples_adc")
        filtered = float(median(samples)) if samples is not None else float(raw)
        baseline = getattr(data, name + "_baseline_adc")
        baseline_source = "acquired" if baseline is not None else "missing"
        configuration = getattr(profile, name) if profile else None
        if baseline is None and configuration and configuration.baseline_adc is not None:
            baseline, baseline_source = configuration.baseline_adc, "configured"
        correction = configuration.environmental_correction if configuration else None
        corrected = filtered
        if correction:
            corrected -= correction.counts_per_celsius * (data.temperature - correction.reference_temperature_c)
            corrected -= correction.counts_per_humidity_percent * (data.humidity - correction.reference_humidity_percent)
            if not 1 <= corrected <= 4094:
                raise ValueError("Environmental correction left the documented ADC domain.")
        features[name + "_normalized"] = corrected / 4095.0
        features[name + "_baseline_normalized"] = baseline / 4095.0 if baseline is not None else None
        sensors[name] = {"raw_adc": raw, "filtered_adc": filtered, "corrected_adc": corrected,
                         "filter": "median" if samples is not None else "single_value_no_temporal_filter",
                         "sample_count": len(samples) if samples is not None else 1,
                         "samples_adc": samples, "baseline_adc": baseline, "baseline_source": baseline_source,
                         "sensor_identifier": configuration.sensor_identifier if configuration else None,
                         "environmental_correction_applied": bool(correction)}
    return {"preprocessing_version": VERSION, "calibration_version": profile.calibration_version if profile else None,
            "calibration_profile_id": profile.profile_id if profile else None, "profile_sha256": profile_digest(profile),
            "is_simulated": simulated, "normalization": "ADC / 4095; no baseline subtraction",
            "feature_order": FEATURES, "units": UNITS, "features": features, "sensors": sensors,
            "calibration_evidence_reference": profile.evidence_reference if profile else None}
