"""Embedded TinyDB collections for custody projections and temperature evidence."""
import json
import os
from contextlib import contextmanager
from pathlib import Path
from tempfile import NamedTemporaryFile

from filelock import FileLock, Timeout
from tinydb import TinyDB
from tinydb.storages import Storage

from app.common import SampleMindException, settings
from app.common.config import BASE_DIR


class AtomicJSONStorage(Storage):
    """Publish a complete snapshot even if a writer is interrupted."""

    def __init__(self, path: Path):
        self.path = path

    def read(self):
        if not self.path.exists():
            return None
        with self.path.open(encoding="utf-8") as source:
            return json.load(source)

    def write(self, data):
        with NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=self.path.parent, prefix=".tinydb-", delete=False
        ) as output:
            temporary = Path(output.name)
            try:
                json.dump(data, output, ensure_ascii=False, allow_nan=False)
                output.flush()
                os.fsync(output.fileno())
                output.close()
                os.replace(temporary, self.path)
            finally:
                output.close()
                temporary.unlink(missing_ok=True)


@contextmanager
def document_store():
    path = Path(settings.DOCUMENT_DB_PATH)
    if not path.is_absolute():
        path = BASE_DIR / path
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with FileLock(str(path) + ".lock", timeout=5), TinyDB(path, storage=AtomicJSONStorage) as store:
            yield store
    except (OSError, Timeout, json.JSONDecodeError) as error:
        raise SampleMindException(503, "The document store is unavailable. Try again.", "DOCUMENT_STORE_UNAVAILABLE") from error

