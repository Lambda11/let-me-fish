<img src=http://u.cubeupload.com/Owyn/lemmefish.jpg>

# Let-me-Fish
TERA-proxy module that mass-auto-fishes fishes, auto-crafts bait when out of bait, and auto-dismantles fish when inventory gets full.

Emulates human-like behavior mostly, abides human-like delays for actions based on fishing diffculty, retries if something goes wrong, works well even if the game is very limited in CPU resources and minimized.

Supports `auto-nego`tiate (with this fork https://github.com/Owyn/auto-nego ), so you would be able to both auto-fish and auto-negotiate

Supports `Tera-Notifier` ( https://github.com/SerenTera/tera-notifier ), so when fishing stops for some reason you'd get a windows pop-up if you have that module installed too

When you are teleported to another location - stops doing everything.

You can use another type of bait (premium for example) and when you run out of it - it'd craft & use standart type of bait set by your configuration (just have at least 1 normal bait in your inv so it won't try to craft it cuz you ran out of it)


## Usage
Use command `fish` (or `!fish`) then follow instruction as simple as just throwing your fish-rod and it will auto-continue everything for you

`fish save` - saves your used recipe and types of fishes to auto-dismantle into per-character config file which will be used on next login  
`fish gold` - toggles auto-dismantling of goldfishes (default OFF)  
`fish dismantle` - toggles auto-dismantling of common fishes (default ON)  
`fish reset` - resets your loaded config  
`fish list` - lists settings used  
`fish load` - reLoads config file (if you edited it manually and want to reload it right now)  

- you can set a different recipe after using `fish` command but before throwing your rod any time


## Installation
put `defs` insides to `node_modules\tera-data\protocol\` folder  
if you are using the **Limited Proxy** (with limited opcodes) aka **TeraToolBox** you also need to update your **tera-data** opcodes from here (Pinky Proxy): https://github.com/tera-proxy/tera-data/tree/master/map - put those protocol files into `node_modules\tera-data\map\` with replace (that's a folder for opcodes in **addition** to standart ones)

`ERROR: Error: [dispatch] hook: unmapped packet ` means you have no opcodes installed correctly for your current game version  
`unsupported packet ` means you have no defs installed correctly  


## Notes

- Stops when you get 10k fishlets (if you want to auto-discard fishlets (when leveling up rod for example) - use https://github.com/Lambda11/Fish-Deleter )

- Opcodes are gotten via third-party sources mostly (submitted by users), if there are no opcodes for your region - too bad, you'd have to get em yourself, can't help you here, use https://github.com/Owyn/alex-packet-id-finder or https://github.com/Owyn/debug-logger/

- Yes, you can make it catch fish much faster like other cheating fishers do, even like in 2 sec lol, but server might decide to start checking how long it takes for ppl to actually catch  fish and ban all unreasonably fast fishers, so only way to change this timing is to set `disableAutoUpdate` to `true` in `module.json` and edit top lines in the `index.js` file manually at your very own risk

- Make sure you have some free slots in the inventory before fishing and some bait\fish\fish filet to craft bait before you start the `fish`