from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[4] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    allowed_origins: str = "http://localhost:3000"
    github_token: str | None = None

    # Requests per minute per client. Routes that call GitHub are tighter,
    # because each request spends the server's GitHub quota.
    github_requests_per_minute: int = 60
    rank_requests_per_minute: int = 120
    # Large enough for a full POST /rank (100 issues with 20,000-character bodies).
    max_request_bytes: int = 4 * 1024 * 1024

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.allowed_origins.split(",")
            if origin.strip()
        ]


settings = Settings()
