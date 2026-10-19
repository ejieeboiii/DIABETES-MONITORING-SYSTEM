"""Validation responses without echoing credentials or non-finite health inputs."""

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


async def request_validation_error(request, exc: RequestValidationError) -> JSONResponse:
    details = [{"loc": error["loc"], "msg": error["msg"], "type": error["type"]}
               for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": details})
