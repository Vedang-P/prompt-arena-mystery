import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

// Match DetailProp's transform order: place the centered/grounded source part,
// then apply its source-node transform inside the requested placement.
export function scatterInstanceMatrix(placement, offset, sourceMatrix, target=new Matrix4()) {
  const position=new Vector3(...placement.position);
  const rotation=new Euler(...(placement.rotation??[0,0,0]));
  const amount=placement.scale??1;
  const scale=Array.isArray(amount)?new Vector3(...amount):new Vector3(amount,amount,amount);
  const quaternion=new Quaternion().setFromEuler(rotation);
  const grounded=new Matrix4().makeTranslation(offset.x,offset.y,offset.z);
  return target.compose(position,quaternion,scale).multiply(grounded).multiply(sourceMatrix);
}
