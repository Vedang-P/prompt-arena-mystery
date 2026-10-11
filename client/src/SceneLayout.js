// Metres. Imported furniture is centred on X/Z and grounded before placement.
// Surface and seat heights measured using scripts/blender/measure_furniture.py.
export const DESK_TOP = .76882;
export const DESK_SEAT = .49035;
// Gazebo deck and bench seat measured from the CC0 models in inspect_park.py.
export const PARK = { deckY:.2198, bench:[0,.2198,1.1], seatY:.6703, waiting:[-1.3,.15] };
export const BEDROOM = { desk:[2.8,0,-1.5], chair:[1.78,0,-1.5], laptop:[2.8,DESK_TOP,-1.5], lamp:[2.8,DESK_TOP,-2.08], shelf:[-3.8,0,-2.85] };
export const HOME_STAIRS={top:3.7176,landingY:3.6476,landingCenter:[4.7,-2.5],landingSize:[2.7,.14,2.55],upperCenter:[4.55,-4.2],upperSize:[2.65,.14,2.6]};
export const POLICE = { desk:[0,0,-1.05], chair:[0,0,-2.05], officer:[0,-2.05], sameer:[-.72,.55], mother:[.7,.6] };
export const FIELD={car:[-1.4,.006,-1.6],yaw:-1.05,seat:[-.535,.723,.408]};
export function carPoint([x,y,z]){return [FIELD.car[0]+x*Math.cos(FIELD.yaw)+z*Math.sin(FIELD.yaw),FIELD.car[1]+y,FIELD.car[2]-x*Math.sin(FIELD.yaw)+z*Math.cos(FIELD.yaw)];}
export const ROOM_VIEWS={
 gazebo:{at:[0,2.15,6.8],look:[0,1.35,0],fov:58},
 abandoned_field:{at:[1.1,1.95,3.4],look:[-.5,.86,-2.35],fov:55},
 concert:{at:[0,1.85,5.7],look:[0,1.5,-3],fov:62},
 workshop:{at:[0,1.8,5.2],look:[0,1.1,-2.2],fov:64},
 parth_home:{at:[1.55,1.9,5.05],look:[1.45,1.25,-1.45],fov:82},
 police_station:{at:[.3,1.7,3.5],look:[0,1.3,-1.8],fov:64},
 sameer_room:{at:[.2,2.05,3.55],look:[0,1.25,-1.45],fov:88},
 parth_room:{at:[.2,2.05,3.55],look:[0,1.25,-1.45],fov:88},
 cyber_cafe:{at:[.2,1.7,4.4],look:[0,1.3,-1.8],fov:68},
 ngo_hq:{at:[0,1.8,4.5],look:[0,1.4,-3],fov:68},
 ngo_archive:{at:[0,1.7,2.8],look:[0,1.3,-1.8],fov:68},
 hospital:{at:[0,1.7,3.8],look:[0,1.25,-2],fov:66},
 tanush_office:{at:[0,1.7,3.8],look:[0,1.3,-1.8],fov:66},
 enakshi_house:{at:[0,1.7,2.8],look:[0,1.25,-1.2],fov:66},
};
export const PARTH_ANCHORS = {
  pr_laptop:[2.8,DESK_TOP+.12,-1.5], pr_password:[2.8,DESK_TOP+.12,-1.5],
  pr_reports:[2.8,DESK_TOP+.08,-1.5], pr_email:[2.8,DESK_TOP+.12,-1.5], pr_coords:[2.8,DESK_TOP+.12,-1.5],
  pr_bookcase:[-3.8,1.35,-2.57], pr_morse:[-3.8,1.35,-2.57], pr_travel_field:[0,.2,2.8],
};
export const DETAIL_ANCHORS = {
 parth_home:{ph_albums:[-2.8,.405,.9],ph_drums:[2.7,.82,-2.6]},
 abandoned_field:{af_sedan:carPoint([2.31,.705,0]),af_backpack:carPoint([-.535,1.05,.408])},
 cyber_cafe:{cc_dosa:[-3.9,1.15,1.85],cc_cassette:[4.7,.92,-3.1]},
 workshop:{ws_snacks:[.1,.877,-2.2]},
 ngo_archive:{na_system:[2.9,.89,-1.6],na_blade:[2.9,.89,-1.6],na_wall:[-5.9,1.5,.8],na_hide:[0,.2,3.9]},
 tanush_office:{to_drug_report:[-.05,DESK_TOP,-1.35],to_drawer:[-.2,.48,-1.5],to_tablet:[.55,DESK_TOP,-1.5],to_handbook:[1,DESK_TOP,-1.5],to_timetable:[-1.9,1.7,-4.93]},
 enakshi_house:{eh_door:[.8,1.1,-4.2],eh_tablet:[.2,.55,-.4],eh_tablet_content:[.2,.55,-.4],eh_window:[-5.05,1.35,-1.4]},
 hospital:{h4_backdoor:[-5.8,1.2,-4.4],h4_theatre:[5.8,1.3,-4.4],h4_security:[4.7,1.35,-2.2],h4_crowd:[-4.5,.9,-1.1],h4_to_tanush_office:[5.8,.2,-4.4],h6_crowd:[0,.9,-2.1],h6_voice_hq:[0,.9,-2.1],h6_tanush:[0,.9,-2.1],h6_box:[1,.89,-2.1],h6_sacrifice:[0,.9,-2.1],h6_parth_meet:[-2,1,-2],h7_trucks:[-3,.7,-2.2],h7_worker:[3.8,.85,-2.8],h7_floor:[4.2,1.2,-6.75],h8_refer:[0,1,-2.1],h8_spiral:[0,1,-2.1],h8_veer_death:[-2,.9,-2.1],h8_parth2:[-5.8,1.1,-4.4],h8_to_office:[5.8,.2,-4.4]},
 sameer_room:{sr_voicenote:[2.8,DESK_TOP+.14,-1.5],sr_cd_choice:[2.8,DESK_TOP+.14,-1.5],sr_instalitre:[2.8,DESK_TOP+.14,-1.5],sr_ticket:[2.8,DESK_TOP+.14,-1.5],sr4_listings:[2.8,DESK_TOP+.14,-1.5],sr5_connection:[2.8,DESK_TOP+.14,-1.5],sr5_voice_note:[2.8,DESK_TOP+.14,-1.5],sr5_exposed:[2.8,DESK_TOP+.14,-1.5],sameer_room_a6_fullmoon:[2.8,DESK_TOP+.14,-1.5],sameer_room_a7_follow:[2.8,DESK_TOP+.14,-1.5],sameer_room_a7_lua:[-3.8,1.285,-3.05],sameer_room_a7_nigeria:[-3.8,1.285,-3.05],sameer_room_a7_mask:[-2.8,.59,-1.35],sameer_room_a7_continue:[2.8,DESK_TOP+.14,-1.5]},
 police_station:{police_station_a6_arrest:[-.43,DESK_TOP,-1.05],police_station_a6_tell:[.15,DESK_TOP,-.9],police_station_a6_info:[.15,DESK_TOP,-.9],police_station_a6_where:[.15,DESK_TOP,-.9],police_station_a6_video:[.15,DESK_TOP,-.9]},
};
