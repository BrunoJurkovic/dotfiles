local icons = require("icons")

local wifi = sbar.add("item", "wifi", {
  position = "right",
  icon = { string = icons.wifi.connected },
  label = { drawing = false },
  padding_left = 2,
  click_script = "open x-apple.systempreferences:com.apple.preference.network",
})

wifi:subscribe("wifi_change", function(env)
  sbar.exec("system_profiler SPAirPortDataType | awk '/Current Network Information:/ { getline; print substr($0, 13, (length($0) - 13)); exit }'", function(ssid)
    if ssid and ssid ~= "" then
      wifi:set({ icon = { string = icons.wifi.connected } })
    else
      wifi:set({ icon = { string = icons.wifi.disconnected } })
    end
  end)
end)
