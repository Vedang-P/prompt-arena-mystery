import {Matrix3,Vector3} from 'three';
// Keep the imported seated hips on the furniture while lifting the two ankle
// joints a few centimetres for a lower bench. This modifies the licensed rig,
// never geometry, and resets each frame so offsets cannot accumulate.
export function createFootContact(model){
  const feet=['L','R'].map(side=>model.getObjectByName(`Bip01_${side}_Foot`)).filter(Boolean).map(bone=>({bone,position:bone.position.clone()}));
  const delta=new Vector3(),inverse=new Matrix3();
  return lift=>{
    model.updateMatrixWorld(true);
    for(const {bone,position} of feet){
      bone.position.copy(position);
      if(lift>0){inverse.setFromMatrix4(bone.parent.matrixWorld).invert();delta.set(0,lift,0).applyMatrix3(inverse);bone.position.add(delta);}
      bone.updateMatrixWorld(true);
    }
  };
}
