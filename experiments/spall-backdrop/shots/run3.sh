#!/bin/bash
# shoot several (tag scene tod) sets and make a contact sheet of each: shots/run3.sh "e under day" "f under night" ...
cd "$(dirname "$0")/.."
for a in "$@"; do set -- $a; python3 shots/u3.py $1 $2 $3 $4 && ~/.nvm/versions/node/v24.13.0/bin/node tools/cdp.mjs shots/_u3.json 2>&1 | tail -1
python3 -c "
from PIL import Image
t='$1'
ims=[Image.open(f'local/u3/{t}_{n}.png').crop((0,40,1100,870)).resize((550,415)) for n in ['2d_top','2d_below','3d_hz','3d_far']]
sh=Image.new('RGB',(1100,830)); [sh.paste(im,((i%2)*550,(i//2)*415)) for i,im in enumerate(ims)]; sh.save(f'local/u3/sheet_{t}.png')
"; done
