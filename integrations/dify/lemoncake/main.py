"""LemonCake Dify plugin entrypoint.

The `manifest.yaml` declares `meta.runner.entrypoint: main` which tells the
Dify plugin daemon to import this module and call `plugin.run()` to start
the tool runtime. Keep this file minimal — tool logic lives in
`tools/*.py` via provider wiring in `provider/lemoncake.yaml`.
"""

from dify_plugin import Plugin, DifyPluginEnv

plugin = Plugin(DifyPluginEnv(MAX_REQUEST_TIMEOUT=120))

if __name__ == "__main__":
    plugin.run()
