"""Dump stage-size frames (3px cropped) from the reference take at 5 fps into _frames/."""
import cv2, os
D=os.path.dirname(os.path.abspath(__file__))
cap=cv2.VideoCapture(os.path.join(D,'../../../Assets/ref CV 1125.mp4'))
i=0
while True:
    ok,f=cap.read()
    if not ok: break
    if i%6==0:
        cv2.imwrite(os.path.join(D,'_frames',f'f{i//6:04d}.png'),f[3:3+2340],[cv2.IMWRITE_PNG_COMPRESSION,1])
    i+=1
print(i)
