"""Tessellate the downloaded original stair CAD, without generating replacement geometry."""
import sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'.asset-cache/cad-python'))
from OCP.STEPControl import STEPControl_Reader
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.StlAPI import StlAPI_Writer
from OCP.IFSelect import IFSelect_RetDone
for source in (root/'.asset-cache/innerscene').glob('*.step'):
    reader=STEPControl_Reader()
    assert reader.ReadFile(str(source))==IFSelect_RetDone
    reader.TransferRoots();shape=reader.OneShape()
    BRepMesh_IncrementalMesh(shape,.002,False,.25,True).Perform()
    writer=StlAPI_Writer();writer.ASCIIMode=False
    assert writer.Write(shape,str(source.with_suffix('.stl')))
    print('Tessellated',source.name,flush=True)
