import pytest
from src.python.services.parser_service import ParserService


def test_parser_service_init():
    # Test that ParserService can be instantiated
    # This will fail if demoparser2 is not installed
    try:
        service = ParserService("test.dem")
        assert service is not None
    except Exception as e:
        # Expected if file doesn't exist
        err = str(e).lower()
        assert "no such file" in err or "not found" in err or "filenotfound" in err
