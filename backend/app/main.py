from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.common import settings, engine, SampleMindException


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup validation
    print(f"[*] Starting {settings.APP_NAME} in {settings.APP_ENV} mode...")
    print(f"[*] Database mode: {'SQLite' if settings.USE_SQLITE else 'PostgreSQL'}")
    yield
    # Shutdown logic
    print(f"[*] Shutting down {settings.APP_NAME}...")


app = FastAPI(
    title="SampleMind API",
    description="Biological Sample Custody, Testing and Experiment Management",
    version="1.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS Middleware Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global Exception Handler for SampleMind Domain Exceptions
@app.exception_handler(SampleMindException)
async def samplemind_exception_handler(request: Request, exc: SampleMindException):
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.detail,
        headers=exc.headers
    )


# Database constraints are also the last line of defense for concurrent requests.
@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    if "LINEAGE_CYCLE" in str(exc.orig):
        return JSONResponse(status_code=409, content={"code": "LINEAGE_CYCLE_VIOLATION", "message": "This edge would create a lineage cycle."})
    return JSONResponse(status_code=409, content={"code": "INTEGRITY_CONFLICT", "message": "The change conflicts with an existing record or database constraint."})


# Generic Fallback Exception Handler
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    if settings.DEBUG:
        message = str(exc)
    else:
        message = "An unexpected internal server error occurred."
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"code": "INTERNAL_SERVER_ERROR", "message": message}
    )


# System Health Check Endpoint
@app.get("/health", tags=["System"])
def health_check():
    """
    Application availability and database connectivity health probe.
    Does not expose sensitive credentials or stack traces.
    """
    db_status = "unhealthy"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_status = "healthy"
    except Exception:
        db_status = "unhealthy"

    return JSONResponse(status_code=200 if db_status == "healthy" else 503, content={
        "status": "online" if db_status == "healthy" else "degraded",
        "app_name": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "database_mode": "SQLite" if settings.USE_SQLITE else "PostgreSQL",
        "database_status": db_status
    })


@app.get("/api/v1", tags=["System"])
def root():
    return {
        "message": "Welcome to SampleMind API",
        "docs": "/docs",
        "version": "1.1.0"
    }


# ==============================================================================
# Domain Module Routers
# ==============================================================================
from app.modules.auth import auth_router
from app.modules.storage import storage_router, equipment_router
from app.modules.samples import samples_router
from app.modules.lineage import lineage_router
from app.modules.tests import tests_router
from app.modules.experiments import experiments_router, results_router
from app.modules.ancient import ancient_router
from app.modules.incidents import incidents_router
from app.modules.ai_analysis import ai_router
from app.modules.analytics import analytics_router

app.include_router(auth_router)
app.include_router(storage_router)
app.include_router(equipment_router)
app.include_router(samples_router)
app.include_router(lineage_router)
app.include_router(tests_router)
app.include_router(experiments_router)
app.include_router(results_router)
app.include_router(ancient_router)
app.include_router(incidents_router)
app.include_router(ai_router)
app.include_router(analytics_router)

from app.modules.lab.router import router as lab_router
app.include_router(lab_router)



from app.modules.lab.search import router as search_router
app.include_router(search_router)

from app.modules.lab.model_experiment import router as model_experiment_router
app.include_router(model_experiment_router)

from app.modules.lab.console import router as console_router
app.include_router(console_router)

from app.modules.lab.reports import router as reports_router
from app.modules.lab import table_reports
app.include_router(reports_router)

from app.modules.lab.chat import router as chat_router
app.include_router(chat_router)

from app.modules.incidents.desk import router as incident_desk_router
app.include_router(incident_desk_router)

from app.modules.lab.coursework import router as coursework_router
app.include_router(coursework_router)

from app.modules.lab.news import router as news_router
app.include_router(news_router)

from app.common.config import BASE_DIR
from fastapi.staticfiles import StaticFiles

frontend_build = BASE_DIR / "frontend" / "dist"
if frontend_build.is_dir():
    app.mount("/", StaticFiles(directory=frontend_build, html=True), name="workspace")
