import subprocess
import os

# --- TIER 4 TEST: Cross-Platform Compilation & Quality Checks (1 Test) ---

def test_t4_cross_platform_compilation_checks():
    """
    Tier 4 E2E Scenario: Runs formatting, linting, tests, and asset compilation
    to ensure deployment and cross-platform stability readiness.
    """
    # Get project root (parent of tests/e2e)
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

    # 1. Run cargo fmt check
    fmt_res = subprocess.run(
        ["cargo", "fmt", "--all", "--", "--check"],
        cwd=project_root,
        capture_output=True,
        text=True
    )
    assert fmt_res.returncode == 0, f"cargo fmt failed:\nStdout: {fmt_res.stdout}\nStderr: {fmt_res.stderr}"

    # 2. Run cargo clippy
    clippy_res = subprocess.run(
        ["cargo", "clippy", "--workspace", "--all-targets", "--", "-D", "warnings"],
        cwd=project_root,
        capture_output=True,
        text=True
    )
    assert clippy_res.returncode == 0, f"cargo clippy failed:\nStdout: {clippy_res.stdout}\nStderr: {clippy_res.stderr}"

    # 3. Run cargo test
    test_res = subprocess.run(
        ["cargo", "test", "--workspace"],
        cwd=project_root,
        capture_output=True,
        text=True
    )
    assert test_res.returncode == 0, f"cargo test failed:\nStdout: {test_res.stdout}\nStderr: {test_res.stderr}"

    # 4. Run npm run build
    npm_res = subprocess.run(
        ["npm", "run", "build"],
        cwd=project_root,
        capture_output=True,
        text=True
    )
    assert npm_res.returncode == 0, f"npm run build failed:\nStdout: {npm_res.stdout}\nStderr: {npm_res.stderr}"
