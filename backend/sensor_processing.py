"""Dual TGS acquisition boundary; no physical calibration is supplied here.

The old MQ resistance/compensation formula and breath delta threshold must never
be applied to either TGS sensor. A baseline is retained as an observation, not
subtracted without a verified sensor response and acquisition protocol.
"""

from dataclasses import dataclass
import re
from typing import Optional, Protocol
from settings import get_setting


@dataclass(frozen=True)
class TGSCalibrationInputs:
    tgs822_raw_adc: int
    tgs2620_raw_adc: int
    temperature_c: float
    humidity_percent: float
    tgs822_baseline_adc: Optional[int] = None
    tgs2620_baseline_adc: Optional[int] = None
    adc_resolution_bits: int = 12


class TGSCalibrationAdapter(Protocol):
    """Future calibration extension, requiring documented physical evidence.

    Implementations must identify their profile, valid input domain, circuitry,
    response direction, units and environmental correction. Returning None
    means outside the verified domain. This interface is deliberately unwired:
    registering an adapter also requires reviewing its evidence and downstream
    models/bands; existing MQ models and bands are not approved for TGS inputs.
    """

    profile_id: str

    def acetone_related_ppm(self, inputs: TGSCalibrationInputs) -> Optional[float]: ...


def tgs_processing_metadata() -> dict:
    # An optional acquisition profile identifier tracks configuration/provenance
    # only. It cannot switch on calibration or glucose estimation.
    profile_id = get_setting("BREATHDX_TGS_PROFILE_ID").strip() or None
    if profile_id is not None and not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", profile_id):
        raise ValueError("BREATHDX_TGS_PROFILE_ID must contain 1–100 letters, digits, dots, underscores or hyphens.")
    return {"acetone_ppm": None, "diabetes_level": None, "predicted_bgl": None,
            "calibration_status": "unverified", "calibration_profile_id": profile_id,
            "suggestion": "Raw TGS822 and TGS2620 readings saved. Physical calibration is unverified; concentration, monitoring band and experimental glucose estimate are unavailable."}
