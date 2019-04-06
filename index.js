const	ACTION_DELAY_THROW_ROD	= [6023, 6798],		// [Min, Max] in ms, 1000 ms = 1 sec
		ACTION_DELAY_FISH_START	= [1345, 2656],		// [Min, Max] - the pressing of F button to reel and start the minigame
		ACTION_DELAY_FISH_CATCH	= [5564, 15453],	// [Min, Max] - time to win the fishing minigame and get a fish as prize
		DELAY_BASED_ON_FISH_TIER= true; // tier 4 would get caught 4 sec longer, BAF (tier 11) would get caught 11 sec longer etc

const   path = require('path'),
		fs = require('fs');
				
const BAIT_RECIPES = [
	{name: "Bait II",	itemId: 206001, recipeId: 204100},
	{name: "Bait III",	itemId: 206002, recipeId: 204101},
	{name: "Bait IV",	itemId: 206003, recipeId: 204102},
	{name: "Bait V",	itemId: 206004, recipeId: 204103}
];
		
module.exports = function LetMeFish(mod) {
	const command = mod.command;
	
	let enabled = false,
		scanning = false,
		too_much_fishes = false,
		triedDismantling = false,
		myGameId = 0n,
		statFished = 0,
		statFishedTiers = {},
		hooks = [],
		dismantleFish = true,
		dismantleFishGold = false,
		thefishes = [],
		curTier = 0,
		rodId = 0,
		baitId = 0,
		craftId = 0,
		leftArea = 0,
		putinfishes = 0,
		awaiting_dismantling = 0,
		playerLoc = null,
		vContractId = null,
		invenItems = [],
		statStarted = null,
		gSettings = {},
		settingsFileName,
		hasNego = mod.manager.isLoaded('auto-nego'),
		pendingDeals = [],
		negoWaiting = false;
	
	function saveSettings(obj)
	{
		if (Object.keys(obj).length)
		{
			try
			{
				fs.writeFileSync(path.join(__dirname, settingsFileName), JSON.stringify(obj, null, "\t"));
			}
			catch (err)
			{
				command.message("Error saving settings " + err);
				return false;
			}
		}
	}

	function loadSettings()
	{
		try
		{
			return JSON.parse(fs.readFileSync(path.join(__dirname, settingsFileName), "utf8"));
		}
		catch (err)
		{
			//console.log("Error loading settings " + err);
			return {};
		}
	}
	
	if(!fs.existsSync(path.join(__dirname, './saves')))
	{
		fs.mkdirSync(path.join(__dirname, './saves'));
	}

	command.add('fish', {
        $none() {
            enabled = !enabled;
			command.message(`Let me Fish is now: ${enabled ? "enabled" : "disabled"}.`);
			if(enabled)
			{
				start();
				scanning = true;
				let stepN = 1;
				if(!craftId)
				{
					command.message(stepN + ") Click craft on a bait recipe you want to auto-craft");
					stepN++;
				}
				command.message(stepN + ") Throw your rod - and it will auto-start");
			}
			else
			{
				Stop();
			}
		},
		$default() {
			command.message('Error (typo?) in command! see README for the list of valid commands')
		},
		dismantle() {
			dismantleFish = !dismantleFish;
			command.message(`Common Fish dismantling is now: ${dismantleFish ? "enabled" : "disabled"}.`);
		},
		gold() {
			dismantleFishGold = !dismantleFishGold;
			command.message(`Gold Fish dismantling is now: ${dismantleFishGold ? "enabled" : "disabled"}.`);
		},
		reset() {
			dismantleFish = true;
			dismantleFishGold = false;
			craftId = 0;
			baitId = 0;
			command.message("Craft recipe reseted");
			command.message("Bait type for reuse reseted");
			command.message("Types of fishes to auto-dismantle reseted");
		},
		list() {
			command.message("Recipe for auto-craft: " + (craftId ? craftId : "none"));
			command.message("Bait for reusing after craft: " + (baitId ? baitId : "none"));
			command.message("Fish auto-dismantling for common fish: " + dismantleFish + ", for goldfish: " + dismantleFishGold);
		},
		save() {
			command.message("Settings saved and would be carried over to next session on this character");
			gSettings.dismantleFish = dismantleFish;
			gSettings.dismantleFishGold = dismantleFishGold;
			gSettings.craftId = craftId;
			saveSettings(gSettings);
		},
		load() {
			command.message("reLoaded settings file");
			gSettings = loadSettings();
			dismantleFish = gSettings.dismantleFish;
			dismantleFishGold = gSettings.dismantleFishGold;
			craftId = gSettings.craftId;
			let found = BAIT_RECIPES.find(obj => obj.recipeId === craftId);
			if(found)
			{
				baitId = found.itemId;
			}
			else
			{
				command.message("Your config file is corrupted, bait recipe id is wrong");
			}
		}
	});
	
	function addZero(i) 
	{
		if (i < 10) {
			i = "0" + i;
		}
		return i;
	}
	
	function rng([min, max])
	{
		return min + Math.floor(Math.random() * (max - min + 1));
	}
	
	function Stop()
	{
		enabled = false
		vContractId = null;
		too_much_fishes = false;
		triedDismantling = false;
		putinfishes = 0;
		unload();
		mod.clearAllTimeouts();
		if(!scanning)
		{
			let d = new Date();
			let t = d.getTime();
			let timeElapsedMSec = t-statStarted;
			d = new Date(1970, 0, 1); // Epoch
			d.setMilliseconds(timeElapsedMSec);
			let h = addZero(d.getHours());
			let m = addZero(d.getMinutes());
			let s = addZero(d.getSeconds());
			command.message('Fished out: ' + statFished + ' fishes. Time elapsed: ' + (h + ":" + m + ":" + s) + ". Per fish: " + Math.round((timeElapsedMSec / statFished) / 1000) + " sec");
			command.message('Fishes: ');
			for(let i in statFishedTiers)
			{
				command.message('Tier ' + i + ': ' + statFishedTiers[i]);
			}
			statFished = 0;
			statFishedTiers = {};
		}
		else
		{
			command.message('You decided not to fish?');
		}
	}
	
	function reel_the_fish()
	{
		mod.toServer("C_START_FISHING_MINIGAME", 1, {});
	}
	
	function catch_the_fish()
	{
		statFished++;
		mod.toServer("C_END_FISHING_MINIGAME", 1, {success:true});
		mod.setTimeout(throw_the_rod, rng(ACTION_DELAY_THROW_ROD));
	}
	
	function check_if_fishing()
	{
		command.message("Why are we not fishing?... Maybe no bait used?");
		console.log("Why are we not fishing?... Maybe no bait used?");
		mod.setTimeout(use_bait_item, 500);
	}
	
	function throw_the_rod()
	{
		if(pendingDeals.length)
		{
			command.message("Lets address suggested deals and give it some time...");
			//console.log("nego start wait");
			
			for(let i = 0; i < pendingDeals.length; i++)
			{
				mod.toClient('S_TRADE_BROKER_DEAL_SUGGESTED', 1, pendingDeals[i]);
				pendingDeals.splice(i--, 1);
			}
			negoWaiting = true;
			mod.setTimeout(throw_the_rod, (rng(ACTION_DELAY_THROW_ROD)*6));
		}
		else if(baitId && !invenItems.filter((item) => item.id === baitId).length)
		{
			command.message("No bait found in inventory, lets craft some!");
			mod.setTimeout(craft_bait_start, rng(ACTION_DELAY_FISH_START)/4);
		}
		else if(rodId)
		{
			negoWaiting = false;
			mod.toServer('C_USE_ITEM', 3, {
				gameId: myGameId,
				id: rodId,
				dbid: 0n, // dbid is sent only when used from inventory, but not from quickslot
				target: 0n,
				amount: 1,
				dest: 0,
				loc: playerLoc.loc,
				w: playerLoc.w,
				unk1: 0,
				unk2: 0,
				unk3: 0,
				unk4: true
			});
			mod.clearAllTimeouts();
			mod.setTimeout(check_if_fishing, rng(ACTION_DELAY_FISH_START)+180000); // 180 sec cuz after dismantling it might take 2+ minutes for a fish to bite
		}
		else
		{
			command.message("You didn't use your rod item when you was told to, did you? Now let-me-fish can't rethrow it for you...");
			Stop();
		}
	}
	
	function use_bait_item()
	{
		if(baitId)
		{
			triedDismantling = false;
			mod.toServer('C_USE_ITEM', 3, {
				gameId: myGameId,
				id: baitId,
				dbid: 0n, // dbid is sent only when used from inventory, but not from quickslot
				target: 0n,
				amount: 1,
				dest: 0,
				loc: playerLoc.loc,
				w: playerLoc.w,
				unk1: 0,
				unk2: 0,
				unk3: 0,
				unk4: true
			});
			mod.setTimeout(throw_the_rod, rng(ACTION_DELAY_FISH_START));
		}
		else
		{
			command.message("How can you fish without a bait?... hmmm...");
			Stop();
		}
	}
	
	function cleanup_by_dismantle()
	{
		if(enabled)
		{
			if(dismantleFish || dismantleFishGold)
			{
				thefishes.length = 0;
				if(dismantleFish)
				{
					 thefishes = invenItems.filter((item) => item.id >= 206400 && item.id <= 206435);
				}
				if(dismantleFishGold)
				{
					 thefishes = thefishes.concat(invenItems.filter((item) => item.id >= 206500 && item.id <= 206505));
				}
				if(thefishes.length > 20)
				{
					command.message("Found total fishes: " + thefishes.length);
					awaiting_dismantling = thefishes.length;
					too_much_fishes = true;
					while(thefishes.length > 20)
					{
						thefishes.pop();
					}
				}
				else
				{
					too_much_fishes = false;
				}
				if(thefishes.length)
				{
					command.message("Gonna dismantle this much fishes now: " + thefishes.length);
					if(!vContractId)
					{
						mod.toServer('C_REQUEST_CONTRACT', 1, {type: 89});
					}
					mod.setTimeout(dismantle_put_in_one_fish, (rng(ACTION_DELAY_FISH_START)+2000));
				}
				else if(awaiting_dismantling <= 0)
				{
					command.message("No fishes-to-dismantle found in your inventory, can't free up space, stopping");
					console.log("No fishes-to-dismantle found in your inventory, can't free up space, stopping");
					Stop();
				}
				else // what the fuck is this shit
				{
					command.message("There is still " + awaiting_dismantling + " fishes awaiting dismantling but we couldn't find them in the inventory, lets ignore them for now and continue fishing");
					console.log("There is still " + awaiting_dismantling + " fishes awaiting dismantling but we couldn't find them in the inventory, lets ignore them for now and continue fishing"); 
					console.log("Please send inventory snapshot below to issues for further investigation (don't forget to hide your gameID at top there)");
					console.log("inventory: (reported empty of fish)");
					console.log(invenItems);
					console.log("fish array (reported empty): ");
					console.log(thefishes);
					awaiting_dismantling = 0;
					mod.setTimeout(dismantle_start2, rng(ACTION_DELAY_FISH_START)); // cancel contract & throw the ro
				}
			}
			else
			{
				command.message("You disabled auto-dismantle, didn't you? Now let-me-fish can't free up inventory space for you... Stopping");
				Stop();
			}
		}
	}
	
	function dismantle_put_in_one_fish()
	{
		if(vContractId)
		{
			const thefish = thefishes.pop();
			if(thefish)
			{
				putinfishes++;
				mod.toServer('C_RQ_ADD_ITEM_TO_DECOMPOSITION_CONTRACT', 1, {
					contractId: vContractId,
					dbid: thefish.dbid,
					id: thefish.id,
					count: 1
				});
			}

			if(thefishes.length)
			{
				mod.setTimeout(dismantle_put_in_one_fish, (rng(ACTION_DELAY_FISH_START)/4));
			}
			else
			{
				mod.setTimeout(dismantle_start0, (rng(ACTION_DELAY_FISH_START)/2));
			}
		}
		else
		{
			command.message("Hmmm... we didn't get a contract for dismantlying for some reason (lag?)... lets try again");
			mod.setTimeout(cleanup_by_dismantle, (rng(ACTION_DELAY_FISH_START)+1500));
		}
	}
	
	function dismantle_start0()
	{
		mod.toServer('C_RQ_START_SOCIAL_ON_PROGRESS_DECOMPOSITION', 1, { contract: vContractId });
		mod.setTimeout(dismantle_start, 1925);
	}
	
	function dismantle_start()
	{
		awaiting_dismantling =- putinfishes;
		putinfishes = 0;
		mod.toServer('C_RQ_COMMIT_DECOMPOSITION_CONTRACT', 1, {contract: vContractId});
		if(too_much_fishes)
		{
			//mod.setTimeout(cleanup_by_dismantle, rng(ACTION_DELAY_FISH_START)+1500);
		}
		else
		{
			mod.setTimeout(dismantle_start2, rng(ACTION_DELAY_FISH_START));
		}
	}
	
	function dismantle_start2()
	{
		if(vContractId)
		{
			mod.toServer('C_CANCEL_CONTRACT', 1, {
				type: 89,
				id: vContractId
			});
			vContractId = null;
		}
		if(enabled)
		{
			mod.setTimeout(throw_the_rod, rng(ACTION_DELAY_THROW_ROD)+1000); // lets resume fishing
		}
	}
	
	function craft_bait_start(chain)
	{
		if(craftId)
		{
			let filets = invenItems.find((item) => item.id === 204052);
			let needed = (chain ? 2 : 1) * (15 + ((craftId - 204100) * 5)); // inven gets updated AFTER you send another C_START_PRODUCE
			if(filets && filets.amount >= needed ) // need one more to trigger "can't craft more bait"
			{
				mod.toServer('C_START_PRODUCE', 1, {recipe:craftId, unk: 0});
			}
			else if(!triedDismantling)
			{
				triedDismantling = true;
				mod.setTimeout(cleanup_by_dismantle, rng(ACTION_DELAY_THROW_ROD));
				command.message("You don't have enough fish parts to craft a bait... dismantling fishes to get some");
			}
			else if(chain || invenItems.filter((item) => item.id === baitId).length) // managed to craft few
			{
				command.message("Crafted few bait items, then ran out of fish parts, but lets fish again anyway with what we have now!");
				mod.setTimeout(use_bait_item, rng(ACTION_DELAY_FISH_START));
			}
			else
			{
				command.message("You don't have enough fish parts to craft a bait and no fish to dismantle for fish parts... stopping");
				console.log("You don't have enough fish parts to craft a bait  and no fish to dismantle for fish parts... stopping");
				Stop();
			}
		}
		else
		{
			command.message("You didn't provide a sample craft recipe, did you? Now let-me-fish can't craft more bait for you...");
			Stop();
		}
	}

	mod.hook('C_PLAYER_LOCATION', 5, event => {
		playerLoc = event;
	});

	mod.hook('S_LOGIN', 12, event => {
		myGameId = event.gameId;
		invenItems = [];
		rodId = null;
		vContractId = null;
		putinfishes = 0;
		settingsFileName = `./saves/${event.name}-${event.serverId}.json`;
		let lSettings = loadSettings();
		if(!Object.keys(lSettings).length)
		{
			baitId = 0;
			craftId = 0;
			dismantleFish = true;
			dismantleFishGold = false;
		}
		else
		{
			dismantleFish = lSettings.dismantleFish || true;
			dismantleFishGold = lSettings.dismantleFishGold || false;
			craftId = lSettings.craftId || 0;
			let found = BAIT_RECIPES.find(obj => obj.recipeId === craftId);
			if(found)
			{
				baitId = found.itemId;
			}
			else
			{
				command.message("Your config file is corrupted, bait recipe id is wrong");
				console.log("Your config file is corrupted, bait recipe id is wrong");
			}
			/*console.log("LOADED SETTINGS: ");
			console.log(dismantleFish);
			console.log(craftId);
			console.log(baitId);*/
		}
	});
		
	function start()
	{
		if(hooks.length) return;
		
		Hook('S_START_FISHING_MINIGAME', 1, event => {
			if (!enabled || scanning) return;
			
			//let eventgameId = BigInt(data.readUInt32LE(8)) | BigInt(data.readUInt32LE(12)) << 32n;
			if(myGameId === event.gameId)
			{
				let fishTier = event.level; //data.readUInt8(16);
				if(DELAY_BASED_ON_FISH_TIER)
				{
					curTier = fishTier;
				}
				statFishedTiers[fishTier] = statFishedTiers[fishTier] ? statFishedTiers[fishTier]+1 : 1;
				//console.log("size of statFishedTiers now: " + (Object.keys(statFishedTiers).length));
				//console.log(statFishedTiers);
				command.message("Started fishing minigame, Tier: " + fishTier);
				mod.setTimeout(catch_the_fish, (rng(ACTION_DELAY_FISH_CATCH)+(curTier*1000)));
				return false; // lets hide that minigame
			}
		});
		
		Hook('S_FISHING_BITE', 1, event => {
			if (!enabled) return;
			
			//let eventgameId = BigInt(data.readUInt32LE(8)) | BigInt(data.readUInt32LE(12)) << 32n;
			if(myGameId === event.gameId)
			{
				mod.clearAllTimeouts(); // clear check f
				mod.setTimeout(reel_the_fish, rng(ACTION_DELAY_FISH_START));
				leftArea = 0;
				if(scanning)
				{
					scanning = false;
					rodId = event.rodId;
					let d = new Date();
					statStarted = d.getTime();
					command.message("Rod set to: " + rodId);
					if(!craftId)
					{
						command.message("You didn't provide a bait recipe for auto-craft, let-me-fish will stop once it runs out of bait...");
					}
					if(!dismantleFish)
					{
						command.message("You turned OFF fish auto-dismantling for common fish, let-me-fish will stop once inventory runs out of space...");
					}
					command.message("Auto-fishing is started now");
				}
				//command.message("Fish got your bait ");
				return false; // lets hide and enjoy peace of mind with no temptation to smash "F" button
			}
		});
		
		Hook('S_LOAD_TOPO', 3, event => {
			if(enabled)
			{
				Stop();
				command.message("You was teleported while fishing, stopping");
				console.log("You was teleported while fishing, stopping");
			}
		});
		
		Hook('S_INVEN', mod.majorPatchVersion >= 80 ? 18 : 17, event => {
			if(!enabled) return;
			
			invenItems = event.first ? event.items : invenItems.concat(event.items);
			
			if(too_much_fishes && putinfishes === 0 && !event.more)
			{
				mod.clearAllTimeouts();
				mod.setTimeout(function() { command.message("Inventory fully updated, starting dismantling of the next batch of fish"); }, ACTION_DELAY_FISH_START[0]/3);
				mod.setTimeout(cleanup_by_dismantle, rng(ACTION_DELAY_FISH_START)/3);
			}
		});
		
		Hook('S_REQUEST_CONTRACT', 1, event =>{
			if(!enabled || scanning || event.type != 89 || event.senderId !== myGameId) return;
			
			vContractId = event.id;
			command.message("Got the contract id for dismantling: " + event.id);
		});
		
		Hook('S_CANCEL_CONTRACT', 1, event =>{
			if(!enabled || scanning || event.type != 89 || event.id != vContractId || event.senderId !== myGameId) return;
			
			vContractId = null;
			command.message("Contract for dismantling cancelled (not by let-me-fish), retrying fishing sequence...");
			mod.clearAllTimeouts();
			mod.setTimeout(throw_the_rod, rng(ACTION_DELAY_THROW_ROD));
		});

		Hook('C_START_PRODUCE', 1, event =>{
			if(!scanning) return;
			
			craftId = event.recipe;
			let found = BAIT_RECIPES.find(obj => obj.recipeId === event.recipe);
			if(found)
			{
				baitId = found.itemId;
				command.message("Now this recipe would get crafted when out of bait: " + event.recipe + ", and this bait would be activated after: " + baitId);
			}
			else
			{
				command.message("What the hell did you just craft instead of a bait?! Go craft some bait!");
			}
		});
		
		Hook('S_END_PRODUCE', 1, event =>{
			if(!enabled || scanning) return;
			
			if(event.success)
			{
				craft_bait_start(true); // no need to wait, client doesn't (when you click "craft all")
			}
		});
		
		Hook('S_TRADE_BROKER_DEAL_SUGGESTED', 1, event => {
			if(enabled && !scanning && hasNego && !negoWaiting && event.offeredPrice === event.sellerPrice) // lets take a break and trade shall we?
			{
				for(let i = 0; i < pendingDeals.length; i++)
				{
					let deal = pendingDeals[i];
					if(deal.playerId == event.playerId && deal.listing == event.listing) pendingDeals.splice(i--, 1);
				}
				pendingDeals.push(event);
				//console.log("nego deal suggested");
				command.message("Nego deal was suggested, gonna address it after current fish...")
				return false;
			}
		});
		
		Hook('S_SYSTEM_MESSAGE', 1, event => {
			if(!enabled || scanning) return;
			const msg = mod.parseSystemMessage(event.message);
			//command.message(msg.id);
			
			if(msg.id === 'SMT_CANNOT_FISHING_NON_BAIT') // out of bait
			{
				command.message("Out of bait, lets craft some!");
				mod.clearAllTimeouts();
				mod.setTimeout(craft_bait_start, rng(ACTION_DELAY_FISH_START));
			}
			else if(msg.id === 'SMT_ITEM_CANT_POSSESS_MORE') // craft limit
			{
				if(!vContractId)
				{
					command.message("Crafted to the fullest, lets fish again!");
					mod.clearAllTimeouts();
					mod.setTimeout(use_bait_item, rng(ACTION_DELAY_FISH_START));
				}
				else // 10k filet // 3 error sysmsgs at once for that lol
				{
					command.message("You have reached the 10k dismantled fish parts limit, stopping");
					console.log("You have reached the 10k dismantled fish parts limit, stopping");
					mod.clearAllTimeouts();
					if(putinfishes)
					{
						too_much_fishes = false;
						enabled = false;
						dismantle_start0();
						setTimeout(Stop, (rng(ACTION_DELAY_FISH_START)+4000));
					}
					else
					{
						Stop();
					}
				}
			}
			else if(msg.id === 'SMT_CANNOT_FISHING_FULL_INVEN') // full inven
			{
				command.message("Inventory full, lets dismantle fish!");
				mod.clearAllTimeouts();
				mod.setTimeout(cleanup_by_dismantle, rng(ACTION_DELAY_FISH_START)+1500);
			}
			else if(msg.id === 'SMT_CANNOT_FISHING_NON_AREA' && !negoWaiting) // server trolling us?
			{
				command.message("Fishing area changed (you left it?), well that happens... lets try again?");
				console.log("Fishing area changed (you left it?), well that happens... Retrying...");
				mod.clearAllTimeouts();
				leftArea++;
				if(leftArea < 7)
				{
					mod.setTimeout(throw_the_rod, rng(ACTION_DELAY_THROW_ROD));
				}
				else
				{
					Stop();
					command.message("Fishing area changed for good it seems, can't fish anymore, - choose better place next time, stopping");
					console.log("Fishing area changed for good it seems, can't fish anymore, - choose better place next time, stopping");
				}
			}
			else if(msg.id === 'SMT_FISHING_RESULT_CANCLE') // hmmm?
			{
				command.message("Fishing cancelled... lets try again?");
				console.log("Fishing cancelled... due to lag? Retrying...");
				mod.clearAllTimeouts();
				mod.setTimeout(throw_the_rod, rng(ACTION_DELAY_FISH_START)+900);
			}
			else if(msg.id === 'SMT_YOU_ARE_BUSY') // anti-anit-bot
			{
				command.message("Evil people trying to disturb your fishing... lets try again?");
				console.log("Evil people trying to disturb your fishing... Retrying...");
				mod.clearAllTimeouts();
				mod.setTimeout(throw_the_rod, rng(ACTION_DELAY_THROW_ROD));
			}
			else if(negoWaiting && !pendingDeals.length && msg.id === 'SMT_MEDIATE_SUCCESS_SELL') // all out of deals and still waiting?
			{
				command.message('All negotiations finished... resuming fishing shortly')
				//console.log("nego end wait OK");
				mod.clearAllTimeouts();
				mod.setTimeout(throw_the_rod, (rng(ACTION_DELAY_THROW_ROD)+1000));
			}
			else if(msg.id === 'SMT_CANNOT_USE_ITEM_WHILE_CONTRACT') // we want to throw the rod but still trading?
			{
				negoWaiting = true;
				command.message('Negotiations are taking long time to finish... lets wait a bit more')
				//console.log("nego long wait");
				mod.clearAllTimeouts();
				mod.setTimeout(throw_the_rod, (rng(ACTION_DELAY_THROW_ROD)+3000));
			}
        });
	}
	
	function unload()
	{
		if(hooks.length)
		{
			for(let h of hooks) mod.unhook(h);
			hooks = [];
		}
	}

	function Hook()
	{
		hooks.push(mod.hook(...arguments));
	}
}