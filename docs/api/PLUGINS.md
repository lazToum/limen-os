# LIMEN OS — Plugin Architecture

LIMEN OS supports modular extensions via WebAssembly (WASM). Plugins are loaded by `limen-core` and can interact with the system through a controlled interface.

---

## Plugin Manifest (`limen-plugin.toml`)

Every plugin must include a manifest at its root:

```toml
[plugin]
name = "weather-widget"
version = "0.1.0"
author = "waldiez"
wasm = "weather_widget.wasm"
permissions = ["network", "display"]

[commands]
get_weather = "GetWeather"
```

---

## Lifecycle

1.  **Loading**: `limen-core` scans `/var/lib/limen/plugins/` for `.wasm` files.
2.  **Validation**: The manifest is parsed and permissions are verified.
3.  **Initialization**: `#[plugin_init]` is called in the WASM guest.
4.  **Execution**: Plugins respond to registered commands or events via `#[command_handler]`.
5.  **Unloading**: `limen-core` can unload a plugin if it exceeds memory/CPU limits.

---

## Plugin SDK (Rust)

The official SDK is available as `limen-plugin-sdk`.

### Registration

```rust
use limen_plugin_sdk::prelude::*;

#[plugin_init]
fn init(ctx: &PluginContext) -> Result<()> {
    ctx.register_command("get_weather", handle_weather)?;
    Ok(())
}
```

### Handlers

```rust
#[command_handler]
async fn handle_weather(req: CommandRequest) -> CommandResponse {
    // CommandResponse can return JSON, UI updates, or simple strings.
    CommandResponse::widget_update("weather", json!({
        "temp": 22,
        "icon": "sunny"
    }))
}
```

---

## Permissions

Plugins must request permissions to access specific system capabilities:

-   `display`: Ability to push UI updates/widgets to the frontend.
-   `network`: Access to outbound HTTP/TCP requests.
-   `storage`: Access to the plugin's private persistent directory.
-   `voice`: Ability to register new voice keywords/intents.
