-- Add SbarLua module to package search path
package.cpath = package.cpath
  .. ";/Users/" .. os.getenv("USER")
  .. "/.local/share/sketchybar_lua/?.so"

-- Compile C event providers (silently fail if missing toolchain)
local config_dir = os.getenv("CONFIG_DIR")
  or os.getenv("HOME") .. "/.config/sketchybar"
os.execute("(cd " .. config_dir .. "/helpers/event_providers/cpu_load && make 2>/dev/null)")
