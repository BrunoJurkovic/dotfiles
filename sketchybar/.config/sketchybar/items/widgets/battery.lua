local colors = require("colors")
local icons = require("icons")
local settings = require("settings")

local battery = sbar.add("item", "battery", {
  position = "right",
  update_freq = 180,
  label = {
    font = { family = settings.font.text_mono, style = "Regular", size = 11.0 },
  },
  padding_left = 2,
  padding_right = 2,
  click_script = "open x-apple.systempreferences:com.apple.preference.battery",
})

battery:subscribe({ "routine", "power_source_change", "system_woke" }, function(env)
  sbar.exec("pmset -g batt", function(batt_info)
    local found, _, charge = batt_info:find("(%d+)%%")
    if not found then return end

    local charge_num = tonumber(charge)
    local charging = batt_info:find("AC Power") ~= nil

    local icon = icons.battery._0
    local color = colors.danger

    if charging then
      icon = icons.battery.charging
      color = colors.success
    elseif charge_num >= 90 then
      icon = icons.battery._100
      color = colors.success
    elseif charge_num >= 50 then
      icon = icons.battery._75
      color = colors.item
    elseif charge_num >= 30 then
      icon = icons.battery._50
      color = colors.item
    elseif charge_num >= 10 then
      icon = icons.battery._25
      color = colors.warning
    end

    battery:set({
      icon = { string = icon, color = color },
      label = { string = charge .. "%" },
    })
  end)
end)
