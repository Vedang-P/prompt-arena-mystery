// Metres. Imported furniture is centred on X/Z and grounded before placement.
// Surface and seat heights measured using scripts/blender/measure_furniture.py.
export const DESK_TOP = .76882;
export const DESK_SEAT = .49035;
// Gazebo deck and bench seat measured from the CC0 models in inspect_park.py.
// The gazebo bench sits against the back railing (the entrance stays clear),
// with the transparent case found beneath it. Seated cast share the seat mark.
export const PARK = { deckY:.2198, bench:[.1,.2198,-.65], seat:[.1,-.53], seatY:.6703, waiting:[-1.3,.15] };
export const BEDROOM = { desk:[2.8,0,-1.5], chair:[1.78,0,-1.5], laptop:[2.8,DESK_TOP,-1.5], lamp:[2.8,DESK_TOP,-2.08], shelf:[-3.8,0,-2.85] };
// Duvet top raycast; the mask clue is fixed to this surface datum.
export const SAMEER_BED = { center:[-2.8,0,-1.35], surfaceY:.687 };
// Measured from the imported stair: the top walking tread is y=2.800 and its
// far edge sits at z=-1.59 (the 3.72 m bounds height is the handrail). The
// landing edge meets that far edge so the last riser opens onto the upper floor.
export const HOME_STAIRS={top:2.8,landingY:2.73,landingCenter:[4.7,-2.865],landingSize:[2.7,.14,2.55],upperCenter:[4.55,-4.2],upperSize:[2.65,.14,2.6]};
// The measured stair landing reaches the back wall. Keep an unobstructed
// doorway aligned to it and continue the upper floor into Parth's room.
export const HOME_UPPER_DOORWAY={centerX:4.55,bottomY:HOME_STAIRS.top,width:1.72,height:1.86};
// Parth's bedroom furniture stands against the measured walls: bed.glb is
// 1.7 wide by 2.19 deep with its headboard at -z, so the bed head sits on the
// rear wall (inner face z=-9.69) and its side on the right wall (x=6.34); the
// bedside cabinet stands between the bed head and the rear wall; the tall
// bookshelf is rotated so its front faces +x and runs along the left wall
// (x=2.31); the box fills the rear-left corner.
export const HOME_BEDROOM={centerX:4.325,centerZ:-7.65,width:4.35,depth:4.4,ceilingY:5.65,bed:[5.48,HOME_STAIRS.top,-8.58],shelf:[2.61,HOME_STAIRS.top,-7.6],shelfRotation:[0,Math.PI/2,0],nightstand:[4.37,HOME_STAIRS.top,-9.46],box:[2.62,HOME_STAIRS.top,-9.4]};
export function backWallPanels(width,height,opening){
  if(!opening)return [{centerX:0,centerY:height/2,width,height}];
  const left=-width/2,right=width/2,doorLeft=opening.centerX-opening.width/2,doorRight=opening.centerX+opening.width/2;
  const top=Math.min(height,opening.bottomY+opening.height),panels=[];
  const add=(x0,x1,y0,y1)=>{if(x1-x0>1e-4&&y1-y0>1e-4)panels.push({centerX:(x0+x1)/2,centerY:(y0+y1)/2,width:x1-x0,height:y1-y0});};
  add(left,doorLeft,0,height);add(doorRight,right,0,height);add(doorLeft,doorRight,0,opening.bottomY);add(doorLeft,doorRight,top,height);
  return panels;
}
export const POLICE = { desk:[0,0,-1.05], chair:[0,0,-2.05], officer:[0,-2.05], sameer:[-.72,.55], mother:[.7,.6] };
// The imported ward bed's mattress surface was raycast at 0.840 m from its grounded origin.
export const HOSPITAL_BED = { center:[-4.5,0,-1.1], mattressY:.84002 };
export const FIELD={car:[-1.4,.006,-1.6],yaw:-1.05,seat:[.6,.719,.408]};
export const FIELD_TRACKS={center:[FIELD.car[0],FIELD.car[2]+1],offset:.58,width:.22,length:3.8};
export function updateFieldBackpackOrbit({screenDx,screenDy,viewportWidth},wasOverlapping){
 const verticalGap=Math.abs(screenDy);
 const horizontalLimit=viewportWidth<=700?324:384;
 const overlapping=wasOverlapping
  ?screenDx<horizontalLimit+48&&verticalGap<84
  :screenDx<horizontalLimit&&verticalGap<56;
 const separation=overlapping?Math.max(0,64-verticalGap):0;
 const shiftY=screenDy>0?separation:-separation;
 return {overlapping,shiftY};
}
// The hospital's security-panel label runs along the same corridor sight line as
// the theatre column (the operating-theatre clue stacked above the office-door
// travel), so it can sit on top of that stack. Push the security label clear of
// the column in CSS pixels only while the projected boxes overlap, with
// hysteresis so a grazing orbit keeps its arrangement instead of flickering.
export function updateHospitalSecurityOrbit({screenDx,screenDy,viewportWidth},wasOverlapping){
 const verticalGap=Math.abs(screenDy);
 const horizontalLimit=viewportWidth<=700?170:210;
 const overlapping=wasOverlapping
  ?screenDx<horizontalLimit+48&&verticalGap<112
  :screenDx<horizontalLimit&&verticalGap<84;
 const separation=overlapping?Math.max(0,96-verticalGap):0;
 const shiftY=screenDy>0?separation:-separation;
 return {overlapping,shiftY};
}
export const FIELD_BACKGROUND_BUILDING={position:[-7,.006,-34],height:6.2,tint:'#626a72'};
export const FIELD_OVERGROWTH=Array.from({length:36},(_,i)=>{
  const side=i%2?-1:1;
  return {part:`grass_medium_01_${i%3?'large_a':'tall_a'}_LOD0`,position:[side*(3.6+(i*17%37)/5),.008,-11+(i*11%75)/5],rotation:[0,i*2.4,0],scale:2+(i%4)*.42};
});
export function carPoint([x,y,z]){return [FIELD.car[0]+x*Math.cos(FIELD.yaw)+z*Math.sin(FIELD.yaw),FIELD.car[1]+y,FIELD.car[2]-x*Math.sin(FIELD.yaw)+z*Math.cos(FIELD.yaw)];}
export const ROOM_VIEWS={
 gazebo:{at:[0,2.15,6.8],look:[0,1.35,0],fov:58},
 abandoned_field:{at:[-2.9,2.25,4.9],look:[-.8,.9,-1.4],fov:68},
 concert:{at:[0,1.85,5.7],look:[0,1.5,-3],fov:62},
 workshop:{at:[0,1.8,5.2],look:[0,1.1,-2.2],fov:64},
 parth_home:{at:[1.55,2.4,5.05],look:[1.45,2.25,-1.45],fov:94},
 police_station:{at:[.3,1.7,3.5],look:[0,1.3,-1.8],fov:64},
 sameer_room:{at:[.2,2.05,3.55],look:[0,1.25,-1.45],fov:88},
 parth_room:{at:[.2,2.05,3.55],look:[0,1.25,-1.45],fov:88},
 cyber_cafe:{at:[.2,2.05,5.2],look:[0,1.45,-1.8],fov:74},
 ngo_hq:{at:[0,1.8,4.5],look:[0,1.4,-3],fov:68},
 ngo_archive:{at:[0,1.7,2.8],look:[0,1.3,-1.8],fov:68},
 hospital:{at:[0,2.35,4.65],look:[0,1.2,-2],fov:86},
 tanush_office:{at:[0,1.7,3.8],look:[0,1.3,-1.8],fov:66},
 enakshi_house:{at:[0,1.7,2.8],look:[0,1.25,-1.2],fov:66},
};
// Walkable envelope per room: half-width on X, and the Z span the WASD camera
// may visit (set slightly beyond the shell so the front-view camera stays legal).
export const ROOM_BOUNDS={
 gazebo:{x:14,zMin:-12,zMax:10},
 abandoned_field:{x:16,zMin:-14,zMax:8},
 concert:{x:12,zMin:-12,zMax:8},
 workshop:{x:12,zMin:-12,zMax:8},
 parth_home:{x:7,zMin:-10,zMax:6},
 police_station:{x:6.5,zMin:-5.5,zMax:5.5},
 sameer_room:{x:5.5,zMin:-4.5,zMax:4.5},
 parth_room:{x:5.5,zMin:-4.5,zMax:4.5},
 cyber_cafe:{x:7,zMin:-6,zMax:6},
 ngo_hq:{x:9.5,zMin:-7.5,zMax:7.5},
 ngo_archive:{x:6.5,zMin:-5,zMax:5},
 hospital:{x:8.5,zMin:-8,zMax:7.5},
 tanush_office:{x:7,zMin:-5.5,zMax:5.5},
 enakshi_house:{x:6,zMin:-5,zMax:5},
};
export const PARTH_ANCHORS = {
  pr_laptop:[2.8,DESK_TOP+.12,-1.5], pr_password:[2.8,DESK_TOP+.12,-1.5],
  pr_reports:[2.8,DESK_TOP+.08,-1.5], pr_email:[2.8,DESK_TOP+.12,-1.5], pr_coords:[2.8,DESK_TOP+.12,-1.5],
  pr_bookcase:[-3.8,1.35,-2.57], pr_morse:[-3.8,1.35,-2.57], pr_travel_field:[0,.2,2.8],
};
export const DETAIL_ANCHORS = {
 parth_home:{ph_albums:[-2.8,.405,.9],ph_drums:[2.7,.82,-2.6]},
 abandoned_field:{af_sedan:carPoint([2.31,.705,0]),af_backpack:carPoint([FIELD.seat[0],FIELD.seat[1]+.327,FIELD.seat[2]])},
 cyber_cafe:{cc_dosa:[-3.9,1.15,1.85],cc_cassette:[4.7,.92,-3.1]},
 workshop:{ws_snacks:[.1,.877,-2.2]},
 ngo_archive:{na_system:[2.9,.89,-1.6],na_playback:[2.9,.89,-1.6],na_blade:[2.9,.89,-1.6],na_wall:[-5.9,1.5,.8],na_plea:[-5.9,1.5,.8],na_hide:[0,.2,3.9],na_delve:[0,.2,3.9]},
 tanush_office:{to_drug_report:[-.05,DESK_TOP,-1.35],to_drawer:[-.2,.48,-1.5],to_tablet:[.55,DESK_TOP,-1.5],to_handbook:[1,DESK_TOP,-1.5],to_timetable:[-1.9,1.7,-4.93],
  h8_office_clue:[.2,.5,.6],h8_office:[4.5,.9,.1],h8_years:[-1.9,1.5,-4.7],h8_burn:[1.45,DESK_TOP,-1.4],h8_rooms:[4.2,1.5,-4.4],h8_why:[6.44,1.5,-2.3],h8_found:[.4,1,-2.65],h8_saved:[3,.55,.1],h8_where:[-4.3,.95,-4.2],h8_wrong:[.55,DESK_TOP,-1.6]},
 enakshi_house:{eh_door:[.8,1.1,-4.2],eh_tablet:[.2,.55,-.4],eh_tablet_content:[.2,.55,-.4],eh_window:[-5.05,1.35,-1.4]},
 hospital:{h4_backdoor:[-5.8,1.2,-4.4],h4_theatre:[5.8,1.3,-4.4],h4_security:[4.7,1.35,-2.2],h4_crowd:[-4.5,.9,-1.1],h4_to_tanush_office:[5.8,.2,-4.4],h6_crowd:[0,.9,-2.1],h6_voice_hq:[0,.9,-2.1],h6_tanush:[0,.9,-2.1],h6_box:[1,.89,-2.1],h6_sacrifice:[0,.9,-2.1],h6_parth_meet:[-2,1,-2],h7_trucks:[-3,.7,-2.2],h7_worker:[3.8,.85,-2.8],h7_floor:[4.2,1.2,-6.75],h8_refer:[0,1,-2.1],h8_spiral:[0,1,-2.1],h8_veer_death:[-2,.9,-2.1],h8_escape:[-5.8,1.1,-4.4],h8_to_office:[5.8,.2,-4.4]},
 sameer_room:{sr_voicenote:[2.8,DESK_TOP+.14,-1.5],sr_cd_choice:[2.8,DESK_TOP+.14,-1.5],sr_instalitre:[2.8,DESK_TOP+.14,-1.5],sr_ticket:[2.8,DESK_TOP+.14,-1.5],sr4_listings:[2.8,DESK_TOP+.14,-1.5],sr5_connection:[2.8,DESK_TOP+.14,-1.5],sr5_voice_note:[2.8,DESK_TOP+.14,-1.5],sr5_exposed:[2.8,DESK_TOP+.14,-1.5],sameer_room_a6_fullmoon:[2.8,DESK_TOP+.14,-1.5],sameer_room_a7_follow:[2.8,DESK_TOP+.14,-1.5],sameer_room_a7_lua:[-3.8,1.285,-3.05],sameer_room_a7_nigeria:[-3.8,1.285,-3.05],sameer_room_a7_mask:[SAMEER_BED.center[0],SAMEER_BED.surfaceY+.018,SAMEER_BED.center[2]],sameer_room_a7_continue:[2.8,DESK_TOP+.14,-1.5]},
 police_station:{police_station_a6_tell:[.15,DESK_TOP,-.9],police_station_a6_info:[.15,DESK_TOP,-.9],police_station_a6_where:[.15,DESK_TOP,-.9],police_station_a6_video:[.15,DESK_TOP,-.9]},
};
