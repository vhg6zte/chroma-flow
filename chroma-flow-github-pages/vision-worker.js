importScripts(new URL('./vendor/vision_bundle.js',self.location.href).href);
const {FilesetResolver,HandLandmarker,FaceLandmarker}=vision;
let hands,face,lastFace=0,faceResult=null;
self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',self.location.href).href);
      hands=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./models/hand_landmarker.task',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55});
      try{
        face=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./models/face_landmarker.task',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5});
      }catch(error){self.postMessage({type:'face-warning',message:String(error.message||error)});}
      self.postMessage({type:'ready',faceAvailable:!!face});
    }else if(data.type==='frame'){
      const {bitmap,timestamp,expressions}=data;
      try{
        const handResult=hands.detectForVideo(bitmap,timestamp);
        let freshFace=false;
        if(face&&expressions&&timestamp-lastFace>=120){faceResult=face.detectForVideo(bitmap,timestamp);lastFace=timestamp;freshFace=true;}
        self.postMessage({type:'result',hands:handResult,face:expressions?faceResult:null,freshFace,timestamp});
      }finally{bitmap.close();}
    }
  }catch(error){console.error(error);self.postMessage({type:'error',message:String(error.message||error),needsWebGL:/activeTexture|WebGL|GL context|bindTexture/i.test(String(error.message||error))});}
};
