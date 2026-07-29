from board_agent_worker import PACKAGE_NAME, PHASE


def test_package_identity() -> None:
    assert PACKAGE_NAME == "board-agent-worker"
    assert PHASE == "phase-0-placeholder"
