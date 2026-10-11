export const musicFor=room=>['sameer_room','ngo_archive','hospital'].includes(room)?'unknown':['police_station','parth_home','abandoned_field'].includes(room)?'search':'dusk';
const FIELD_AMBIENCE=Object.freeze([
  Object.freeze({file:'wind-loop.mp3',gain:.05}),
  Object.freeze({file:'crickets.mp3',gain:.3}),
]);
export const ambienceFor=room=>room==='abandoned_field'?FIELD_AMBIENCE:null;
