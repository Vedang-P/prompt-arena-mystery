// Metres. Imported furniture is centred on X/Z and grounded before placement.
// Surface and seat heights measured using scripts/blender/measure_furniture.py.
export const DESK_TOP = .76882;
export const DESK_SEAT = .49035;
export const BEDROOM = { desk:[2.8,0,-1.5], chair:[1.78,0,-1.5], laptop:[2.8,DESK_TOP,-1.5], lamp:[2.8,DESK_TOP,-2.08], shelf:[-3.8,0,-2.85] };
export const POLICE = { desk:[0,0,-1.05], chair:[0,0,-2.05], officer:[0,-2.05], sameer:[-.72,.55], mother:[.7,.6] };
export const PARTH_ANCHORS = {
  pr_laptop:[2.8,DESK_TOP+.12,-1.5], pr_password:[2.8,DESK_TOP+.12,-1.5],
  pr_reports:[2.8,DESK_TOP+.08,-1.5], pr_email:[2.8,DESK_TOP+.12,-1.5], pr_coords:[2.8,DESK_TOP+.12,-1.5],
  pr_bookcase:[-3.8,1.35,-2.57], pr_morse:[-3.8,1.35,-2.57], pr_travel_field:[0,.2,2.8],
};
