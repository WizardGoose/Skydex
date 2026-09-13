/* Generated from data/wiki/modules/Module_Pet_Data.lua by tools/build-pet-stats.mjs. */
export interface PetStatDefinition {
  name: string;
  base: number;
  perLevel: number;
}

export interface PetAbilityDefinition {
  index: number;
  name: string;
  description: string;
}

export interface PetAbilityVariableDefinition {
  base: number;
  perLevel: number;
  roundDown: boolean;
  eval: string | null;
}

export interface PetAbilityTierDefinition {
  indices: readonly number[];
  variables: Readonly<Record<string, PetAbilityVariableDefinition>>;
}

export interface PetStatDefinitionSet {
  petType: string | null;
  base: readonly PetStatDefinition[];
  byTier: Readonly<Record<string, readonly PetStatDefinition[]>>;
  abilities: readonly PetAbilityDefinition[];
  abilitiesByTier: Readonly<Record<string, PetAbilityTierDefinition>>;
}

export const PET_STAT_DEFINITIONS: Readonly<Record<string, PetStatDefinitionSet>> = {
  "ANKYLOSAURUS": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 1.5
      },
      {
        "name": "Defense",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "True Defense",
        "base": 0,
        "perLevel": 0.15
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Armored Tank",
        "description": "&7Gain &a{1}% &7of your &a Defense &7as &c/&cStrength&7. &8(Max +500)"
      },
      {
        "index": 2,
        "name": "Unyielding",
        "description": "&7Increase the effectiveness of &d&lLast/&d&lStand &7and &6Lifeline &7by &a{2}%&7."
      },
      {
        "index": 3,
        "name": "Clubbed Tail",
        "description": "&7Every 5th hit deals &a{3}% &7of your/&7final damage to enemies within 5/&7blocks. Enemies hit deal 10% less/&7damage for 10s."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "AMMONITE": {
    "petType": "Fishing Pet",
    "base": [
      {
        "name": "Sea Creature Chance",
        "base": 0,
        "perLevel": 0.05
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Heart of the Sea",
        "description": "&7Grants &3+{1} Sea Creature/&3Chance &7to your pet for each/&5Heart of the Mountain &7level."
      },
      {
        "index": 2,
        "name": "Expert Cave Fisher",
        "description": "&7Grants &9+{2} Double Hook Chance/&7for each &5Heart of the Mountain &7level/&7while in the &5Crystal Hollows&7."
      },
      {
        "index": 3,
        "name": "Gift of the Ammonite",
        "description": "&7Each Mining and Fishing level grants/&b+{3} Fishing Speed&7,/&7&f+{4} Speed /&7and &a+{5}/&aDefense&7."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.005,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.005,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "ARMADILLO": {
    "petType": "Mining Mount",
    "base": [
      {
        "name": "Defense",
        "base": 0,
        "perLevel": 2
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Ridable",
        "description": "&7Right-click your summoned pet to/&7ride it! Moves faster based on your/&f Speed&7."
      },
      {
        "index": 2,
        "name": "Tunneller",
        "description": "&7While in the &5Crystal Hollows&7, this Pet/&7breaks all blocks in its path using/&7your held item."
      },
      {
        "index": 3,
        "name": "Rolling Miner",
        "description": "&7Every &a{1} &7seconds, the next/&dGemstone &7you mine gives &a2x &7drops."
      },
      {
        "index": 4,
        "name": "Long Claws",
        "description": "&7Grants &e{2} Mining Spread &7while/&7mining Hard Stone."
      },
      {
        "index": 5,
        "name": "Well-Worked",
        "description": "&7Consumes &e{3} &7less energy when/&7tunneling."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1,
          2
        ],
        "variables": {}
      },
      "UNCOMMON": {
        "indices": [
          1,
          2
        ],
        "variables": {}
      },
      "RARE": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 60,
            "perLevel": -0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 60,
            "perLevel": -0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 60,
            "perLevel": -0.4,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4,
          5
        ],
        "variables": {
          "1": {
            "base": 60,
            "perLevel": -0.4,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 3,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "BABY_YETI": {
    "petType": "Fishing Pet",
    "base": [
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Fishing Speed",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Sea Creature Chance",
        "base": 0,
        "perLevel": 0.05
      }
    ],
    "byTier": {
      "MYTHIC": [
        {
          "name": "Strength",
          "base": 0,
          "perLevel": 0.5
        },
        {
          "name": "Fishing Speed",
          "base": 0,
          "perLevel": 0.5
        },
        {
          "name": "Sea Creature Chance",
          "base": 0,
          "perLevel": 0.05
        },
        {
          "name": "Cold Resistance",
          "base": 0,
          "perLevel": 0.1
        }
      ]
    },
    "abilities": [
      {
        "index": 1,
        "name": "Yeti Fury",
        "description": "&7Buffs the &6Yeti Sword &7by &a{1} &c/&cDamage &7and &b Intelligence &7and/&7reduces its cooldown by &a{2}%&7."
      },
      {
        "index": 2,
        "name": "Cold Breeze",
        "description": "&7Increases &cCombat Stats &7and &bFishing/&bStats &7by &a{3}% &7while on &cJerry's/Workshop&7."
      },
      {
        "index": 3,
        "name": "Frosty Familiarity",
        "description": "&7Grants &b+{4} Magic Find &7against/&fWinter Sea Creatures&7."
      },
      {
        "index": 4,
        "name": "Family Gathering",
        "description": "&7Grants &d{5} Tracking &7while on/&cJerry's Workshop&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.35,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.35,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "BAL": {
    "petType": "Mining Pet",
    "base": [
      {
        "name": "Heat Resistance",
        "base": 0,
        "perLevel": 1.5
      },
      {
        "name": "Mining Fortune",
        "base": 0,
        "perLevel": 1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Furnace",
        "description": "&7Grants &5+{1} Pristine &7while in the/&cMagma Fields&7."
      },
      {
        "index": 2,
        "name": "Dispersion",
        "description": "&7While in the &5Crystal Hollows&7, killing/&7mobs reduces your &c Heat &7by &c4&7."
      },
      {
        "index": 3,
        "name": "Chimney",
        "description": "&7Reduce Pickaxe Ability cooldowns by/&a10%&7."
      }
    ],
    "abilitiesByTier": {
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.04,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.03,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.04,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "BAT": {
    "petType": "Mining Pet",
    "base": [
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.05
      }
    ],
    "byTier": {
      "MYTHIC": [
        {
          "name": "Intelligence",
          "base": 0,
          "perLevel": 1
        },
        {
          "name": "Speed",
          "base": 0,
          "perLevel": 0.05
        },
        {
          "name": "Fishing Speed",
          "base": 0,
          "perLevel": 0.4
        },
        {
          "name": "Sea Creature Chance",
          "base": 0,
          "perLevel": 0.05
        }
      ]
    },
    "abilities": [
      {
        "index": 1,
        "name": "Candy Lover",
        "description": "&7Increases drop chance of candies/&7from mobs by &a{1}%&7."
      },
      {
        "index": 2,
        "name": "Nightmare",
        "description": "&7During night, gain &a{2} &b Intelligence&7,/&a{3} &f Speed&7, and &aNight Vision&7."
      },
      {
        "index": 3,
        "name": "Wings of Steel",
        "description": "&7Deals &a+{4}% &7damage to &6Spooky/&7enemies during the &6Spooky Festival&7."
      },
      {
        "index": 4,
        "name": "Sonar",
        "description": "&7Grants a &a+{5}% &7chance to catch/&6Spooky Sea Creatures &7during the/&6Spooky Festival&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "BEE": {
    "petType": "Farming Pet",
    "base": [
      {
        "name": "Strength",
        "base": 5,
        "perLevel": 0.25
      },
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.1
      }
    ],
    "byTier": {
      "RARE": [
        {
          "name": "Strength",
          "base": 5,
          "perLevel": 0.25
        },
        {
          "name": "Intelligence",
          "base": 0,
          "perLevel": 0.5
        },
        {
          "name": "Speed",
          "base": 0,
          "perLevel": 0.1
        },
        {
          "name": "Mining Fortune",
          "base": 0,
          "perLevel": 0.2
        },
        {
          "name": "Foraging Fortune",
          "base": 0,
          "perLevel": 0.2
        },
        {
          "name": "Farming Fortune",
          "base": 0,
          "perLevel": 0.2
        }
      ],
      "EPIC": [
        {
          "name": "Strength",
          "base": 5,
          "perLevel": 0.25
        },
        {
          "name": "Intelligence",
          "base": 0,
          "perLevel": 0.5
        },
        {
          "name": "Speed",
          "base": 0,
          "perLevel": 0.1
        },
        {
          "name": "Mining Fortune",
          "base": 0,
          "perLevel": 0.25
        },
        {
          "name": "Foraging Fortune",
          "base": 0,
          "perLevel": 0.25
        },
        {
          "name": "Farming Fortune",
          "base": 0,
          "perLevel": 0.25
        }
      ],
      "LEGENDARY": [
        {
          "name": "Strength",
          "base": 5,
          "perLevel": 0.25
        },
        {
          "name": "Intelligence",
          "base": 0,
          "perLevel": 0.5
        },
        {
          "name": "Speed",
          "base": 0,
          "perLevel": 0.1
        },
        {
          "name": "Mining Fortune",
          "base": 0,
          "perLevel": 0.3
        },
        {
          "name": "Foraging Fortune",
          "base": 0,
          "perLevel": 0.3
        },
        {
          "name": "Farming Fortune",
          "base": 0,
          "perLevel": 0.3
        }
      ],
      "MYTHIC": [
        {
          "name": "Strength",
          "base": 5,
          "perLevel": 0.25
        },
        {
          "name": "Intelligence",
          "base": 0,
          "perLevel": 0.5
        },
        {
          "name": "Speed",
          "base": 0,
          "perLevel": 0.1
        },
        {
          "name": "Mining Fortune",
          "base": 0,
          "perLevel": 0.4
        },
        {
          "name": "Foraging Fortune",
          "base": 0,
          "perLevel": 0.4
        },
        {
          "name": "Farming Fortune",
          "base": 0,
          "perLevel": 0.4
        }
      ]
    },
    "abilities": [
      {
        "index": 1,
        "name": "Hive",
        "description": "&7For each player within &a25 &7blocks:/&b +{1} Intelligence/&c +{2} Strength/&a +{3} Defense/&8Max 15 players"
      },
      {
        "index": 2,
        "name": "Busy Buzz Buzz",
        "description": "&7Grants &a+{4} &7of each to your pet:/&6 Farming Fortune/&6 Foraging Fortune/&6 Mining Fortune"
      },
      {
        "index": 3,
        "name": "Honey Harvester",
        "description": "&7You have a &a{5}% &7chance to find a/&aHoney Jar &7when farming crops."
      },
      {
        "index": 4,
        "name": "Powered by Pollen",
        "description": "&7Grants &6+160 Sunflower&7,/&6Moonflower&7, and &6Wild Rose Fortune/&7while in &aThe Garden&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 1,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.04,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 1,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.04,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 1,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.09,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.07,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 1,
            "perLevel": 0.04,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.09,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.07,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 1,
            "perLevel": 0.04,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0,
            "perLevel": 0.0002,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.09,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.07,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 1,
            "perLevel": 0.04,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0,
            "perLevel": 0.0002,
            "roundDown": false,
            "eval": null
          },
          "6": {
            "base": 0,
            "perLevel": 1.6,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "BINGO": {
    "petType": "All Skills",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.25
      },
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.75
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Lucky Looting",
        "description": "&7Gain &c{1}% &7more collection/&7items from any source!"
      },
      {
        "index": 2,
        "name": "Climber",
        "description": "&7Gain &c{2}% &7more &6HOTM&7 and &aHOTF&7 XP."
      },
      {
        "index": 3,
        "name": "Fast Learner",
        "description": "&7Gain &c{3}% &7more Skill Experience and/&7Slayer Experience."
      },
      {
        "index": 4,
        "name": "Chimera",
        "description": "&7Increases the base stats of your/&7active pet by &c{4}%&7."
      },
      {
        "index": 5,
        "name": "Scavenger",
        "description": "&7Gain &c{5} &7more coins per/&7monster level on kill"
      },
      {
        "index": 6,
        "name": "Consumer",
        "description": "&7Potion effects you obtain will have/&c{6} &7more time."
      },
      {
        "index": 7,
        "name": "Power Of Completion",
        "description": "&7Gain &c+2 Strength&7, &9+1/&9Crit Chance&7, and &c+5/&cHealth&7 per completed Personal/&7Bingo Goal in the current Bingo/&7Event."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 5,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 100,
            "perLevel": 1.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 5,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 100,
            "perLevel": 1.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 5,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 5,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 100,
            "perLevel": 1.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 5,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 10,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2,
          3,
          4,
          5
        ],
        "variables": {
          "1": {
            "base": 5,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 100,
            "perLevel": 1.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 5,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 10,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0.1,
            "perLevel": 0.009,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3,
          4,
          5,
          6
        ],
        "variables": {
          "1": {
            "base": 5,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 100,
            "perLevel": 1.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 5,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 10,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0.1,
            "perLevel": 0.009,
            "roundDown": false,
            "eval": null
          },
          "6": {
            "base": 10,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4,
          5,
          6,
          7
        ],
        "variables": {
          "1": {
            "base": 5,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 100,
            "perLevel": 1.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 5,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 10,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0.1,
            "perLevel": 0.009,
            "roundDown": false,
            "eval": null
          },
          "6": {
            "base": 10,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "BLACK_CAT": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 1.25
      },
      {
        "name": "Magic Find",
        "base": 0,
        "perLevel": 0.15
      },
      {
        "name": "Pet Luck",
        "base": 0,
        "perLevel": 0.15
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Hunter",
        "description": "&7Increases your speed and/&7speed cap by +&a{1}&7."
      },
      {
        "index": 2,
        "name": "Omen",
        "description": "&7Grants &a{2} &7&d Pet Luck&7."
      },
      {
        "index": 3,
        "name": "Supernatural",
        "description": "&7Grants &a{3} &7&b Magic Find&7."
      },
      {
        "index": 4,
        "name": "Looting",
        "description": "&7Gain &c{4}% &7more collection/&7items from monsters!"
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "BLAZE": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Defense",
        "base": 0,
        "perLevel": 0.3
      },
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Nether Embodiment",
        "description": "&7Increases &cCombat &7and &dMiscellaneous/&7stats by &a{1}% &7while on the &cCrimson/&cIsle&7."
      },
      {
        "index": 2,
        "name": "Bling Armor",
        "description": "&7Upgrades &cBlaze Armor &7stats/&7and ability by &a{2}%"
      },
      {
        "index": 3,
        "name": "Fusion-Style Potato",
        "description": "&7Double effects of hot potato/&7books."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.075,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.075,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.35,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "BLUE_WHALE": {
    "petType": "Fishing Pet",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 2
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Ingest",
        "description": "&7If you have any absorption active,/&7gain &a+{1}% Damage Reduction&7."
      },
      {
        "index": 2,
        "name": "Bulk",
        "description": "&7Gain &a{2}&a Defense &7per/&7&c{3} Max &c Health."
      },
      {
        "index": 3,
        "name": "Archimedes",
        "description": "&7Gain &c+{4}% Max &c Health."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 30,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 25,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 20,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "CHICKEN": {
    "petType": "Farming Pet",
    "base": [
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Farming Fortune",
        "base": 0,
        "perLevel": 0.5
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Free Range",
        "description": "&7Grants &6+{1} Farming Fortune &7while/&7on &bPublic Islands&7."
      },
      {
        "index": 2,
        "name": "Eggstra Loot",
        "description": "&7Chickens always drop an &fEgg &7when/&7killed. Grants a &a{2}% &7chance for/&7animals to drop an additional item."
      },
      {
        "index": 3,
        "name": "Light Feet",
        "description": "&7Reduces fall damage by &a{3}%&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.8,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "CROW": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 1.5
      },
      {
        "name": "Ability Damage",
        "base": 0,
        "perLevel": 0.2
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Quick Hands",
        "description": "&7Lowers the cooldown of your/&7abilities by &a+{1}%&7."
      },
      {
        "index": 2,
        "name": "Camouflage",
        "description": "&7After casting an ability, increase/&7your &a Defense &7by &a+{2} &7for &b20/&bseconds&7./&8Capped at 500 Defense"
      },
      {
        "index": 3,
        "name": "Insightful",
        "description": "&7Gives a &a{3}% &7chance to not consume/&7Mana when using an ability."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 3,
            "perLevel": 0.07,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 3,
            "perLevel": 0.07,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 3,
            "perLevel": 0.07,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 5,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 3,
            "perLevel": 0.12,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 5,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 3,
            "perLevel": 0.12,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 5,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 3,
            "perLevel": 0.12,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "DOLPHIN": {
    "petType": "Fishing Pet",
    "base": [
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Sea Creature Chance",
        "base": 0,
        "perLevel": 0.05
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Pod Tactics",
        "description": "&7Grants &b+{1} Fishing Speed/&7for each player within &a30/&7blocks, up to &a5 &7players."
      },
      {
        "index": 2,
        "name": "Echolocation",
        "description": "&7Grants &3+{2} Sea Creature/&3Chance."
      },
      {
        "index": 3,
        "name": "Splash Surprise",
        "description": "&7Stun sea creatures for &a5s/&a&7after fishing them up."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.06,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.08,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.08,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.07,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "EERIE": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.1
      },
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 0.5
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Fearnesy",
        "description": "&5Fear &7from &5Great Spook Armor &7in/&7your &bwardrobe &7applies to you, even/&7if you aren't wearing it."
      },
      {
        "index": 2,
        "name": "Fearama",
        "description": "&7Increases &cdamage &7dealt to Primal/&7Fears and Spooky Mobs by &a1% &7for/&7every &5Fear &7you have."
      },
      {
        "index": 3,
        "name": "Fearcreasing",
        "description": "&7Gives &a+{1} &5Fear &7for every &a10 &cPrimal/&cFears &7killed, up to &a150 &cPrimal Fears&7./&cPrimal Fear Kills&7: (&a0&7/&a150&7)"
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {}
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {}
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0.1,
            "perLevel": 0.003,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "ELEPHANT": {
    "petType": "Farming Pet",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 0.75
      }
    ],
    "byTier": {
      "MYTHIC": [
        {
          "name": "Health",
          "base": 0,
          "perLevel": 1
        },
        {
          "name": "Intelligence",
          "base": 0,
          "perLevel": 0.75
        },
        {
          "name": "Farming Fortune",
          "base": 0,
          "perLevel": 0.5
        }
      ]
    },
    "abilities": [
      {
        "index": 1,
        "name": "Stomp",
        "description": "&7Gain &a{1} Defense &7for every/&7100 &f Speed&7."
      },
      {
        "index": 2,
        "name": "Walking Fortress",
        "description": "&7Gain &c{2} Health &7for every/&710 &a Defense&7."
      },
      {
        "index": 3,
        "name": "Trunk Efficiency",
        "description": "&7Grants &6+{3} Farming/&6Fortune, &7which increases your/&7chance for multiple drops."
      },
      {
        "index": 4,
        "name": "Abundant Harvest",
        "description": "&7Earn &2+{4}% Sowdust &7while farming."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 1.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 1.5,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "ENDER_DRAGON": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Crit Chance",
        "base": 0,
        "perLevel": 0.1
      },
      {
        "name": "Crit Damage",
        "base": 0,
        "perLevel": 0.5
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "End Strike",
        "description": "&7Deal &a{1}% &7more damage to &5 Ender/&7mobs."
      },
      {
        "index": 2,
        "name": "One with the Dragons",
        "description": "&7Buffs the &6Aspect of the Dragons/&7sword by &a{2} &c Damage &7and &a{3} &c/&cStrength&7."
      },
      {
        "index": 3,
        "name": "Superior",
        "description": "&7Increases all &cCombat &7stats and &b/&bMagic Find &7by &a{4}%&7."
      }
    ],
    "abilitiesByTier": {
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "ENDERMAN": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Crit Damage",
        "base": 0,
        "perLevel": 0.75
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Enderian",
        "description": "&7Take &a{1}% &7less damage from &5 Ender /&7mobs"
      },
      {
        "index": 2,
        "name": "Teleport Savvy",
        "description": "&7Buffs the Transmission abilities, granting /&a{2} &7weapon damage for 5s on use"
      },
      {
        "index": 3,
        "name": "Zealot Madness",
        "description": "&7Increases your odds to find a/&7special Zealot by &a{3}%&7."
      },
      {
        "index": 4,
        "name": "Enderman Slayer",
        "description": "&7Gain &b{4}x &7Combat XP against &aEndermen&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 1,
            "perLevel": 0.005,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "ENDERMITE": {
    "petType": "Mining Pet",
    "base": [
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 1.5
      },
      {
        "name": "Pet Luck",
        "base": 0,
        "perLevel": 0.1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "More Stonks",
        "description": "&7Gain more exp orbs for/&7breaking end stone and gain a/&7+&a{1}% &7chance to get an extra/&7block dropped."
      },
      {
        "index": 2,
        "name": "Daily Commuter",
        "description": "&9Transmission Abilities/&7cost &a{2}% &7less mana."
      },
      {
        "index": 3,
        "name": "Mite Bait",
        "description": "&7Gain a &a{3}% &7chance to dig up/&7a bonus &cNest Endermite &7per/&d+1 Pet Luck &8(Stacks above/&8100%)."
      },
      {
        "index": 4,
        "name": "Sacrificer",
        "description": "&7Increases the odds of rolling/&7for bonus items in the/&cDraconic Altar &7by &a{4}%&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.8,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.8,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.03,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.03,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "FLYING_FISH": {
    "petType": "Fishing Pet",
    "base": [
      {
        "name": "Defense",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.5
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Quick Reel",
        "description": "&7Grants &b+{1} Fishing Speed&7."
      },
      {
        "index": 2,
        "name": "Water Bender",
        "description": "&7Gives &a{2} &c Strength &7and &a Defense &7/&7when near water."
      },
      {
        "index": 3,
        "name": "Deep Sea Diver",
        "description": "&7Increases the stats of &aDiver Armor/&7and &aAbyssal Armor &7by &a{3}%"
      },
      {
        "index": 4,
        "name": "Lava Bender",
        "description": "&7Gives &a{4} &c Strength &7and/&7&a Defense &7when near lava."
      },
      {
        "index": 5,
        "name": "Magmatic Diver",
        "description": "&7Increases the stats of Magma/&7Lord armor by &a{5}%"
      },
      {
        "index": 6,
        "name": "Rapid Decay",
        "description": "&7Increases the chance to/&7activate the &d&lFlash/&d&lEnchantment&a by {6}%&7."
      }
    ],
    "abilitiesByTier": {
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.6,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.8,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.8,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          4,
          5,
          6
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.8,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "6": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "FROG": {
    "petType": "Foraging Pet",
    "base": [
      {
        "name": "Strength",
        "base": 30,
        "perLevel": 0
      },
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Fishing Speed",
        "base": 0,
        "perLevel": 0.4
      },
      {
        "name": "Respiration",
        "base": 0,
        "perLevel": 0.1
      }
    ],
    "byTier": {
      "MYTHIC": [
        {
          "name": "Strength",
          "base": 30,
          "perLevel": 0
        },
        {
          "name": "Speed",
          "base": 0,
          "perLevel": 0.5
        },
        {
          "name": "Fishing Speed",
          "base": 0,
          "perLevel": 0.4
        },
        {
          "name": "Respiration",
          "base": 0,
          "perLevel": 0.1
        },
        {
          "name": "Trophy Chance",
          "base": 0,
          "perLevel": 0.05
        }
      ]
    },
    "abilities": [
      {
        "index": 1,
        "name": "Hunting Enjoyer",
        "description": "&7Increases your chance to catch/&2Forest &7Shards by &a{1}%&7."
      },
      {
        "index": 2,
        "name": "Hunting Enjoyer",
        "description": "&7Increases your chance to catch/&2Forest &7and &bWater &7Shards by &a{1}%&7."
      },
      {
        "index": 3,
        "name": "Hunting Enjoyer",
        "description": "&7Increases your chance to catch/&2Forest&7, &bWater&7, and &cCombat &7Shards by/&a{1}%&7."
      },
      {
        "index": 4,
        "name": "Hop",
        "description": "&7Grants&6 {2} Foraging Fortune &7for/&e20 &7seconds every time you jump."
      },
      {
        "index": 5,
        "name": "Happy Tree Friends",
        "description": "&7Grants&6 {3} Foraging Fortune &7for/&7every other &2Frog Pet &7on the island,/&7up to &b10 &7frogs."
      },
      {
        "index": 6,
        "name": "Happy Tree Friends",
        "description": "&7Grants&6 {4} Foraging Fortune &7and/&b{5} Fishing Speed&7 for every other/&2Frog Pet &7on the island, &7up to &b10/&7frogs."
      },
      {
        "index": 7,
        "name": "Home Sweet Home",
        "description": "&7Increases your chance of catching/&6&lGOLD &7and &b&lDIAMOND &2Trophy Frogs/&7by &a{6}%&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.09,
            "roundDown": true,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          2
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.09,
            "roundDown": true,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          3
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.09,
            "roundDown": true,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.09,
            "roundDown": true,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.79,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          3,
          4,
          5
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.09,
            "roundDown": true,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.79,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 1,
            "perLevel": 0.09,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          3,
          4,
          6,
          7
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.09,
            "roundDown": true,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.79,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 1,
            "perLevel": 0.09,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0.1,
            "perLevel": 0.019,
            "roundDown": false,
            "eval": null
          },
          "6": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "8": {
            "base": 0,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "GHOUL": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Ferocity",
        "base": 0,
        "perLevel": 0.05
      },
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 0.75
      },
      {
        "name": "Vitality",
        "base": 0,
        "perLevel": 0.15
      },
      {
        "name": "Mending",
        "base": 0,
        "perLevel": 0.25
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Undead Slayer",
        "description": "&7Gain &b{1}x &7Combat XP against &aZombies&7."
      },
      {
        "index": 2,
        "name": "Army of the Dead",
        "description": "&7Increases the amount of souls you/&7can store by &a2 &7and the chance of/&7getting a mob's soul by &a{2}%"
      },
      {
        "index": 3,
        "name": "Reaper Soul",
        "description": "&7Reduces the summoning cost of mobs/&7by &a{3}% &7and increases their damage/&7output by &a{4}%&7. Increases the health/&7of all summoned mobs by &a{5}%&7."
      }
    ],
    "abilitiesByTier": {
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.005,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.005,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "GIRAFFE": {
    "petType": "Foraging Pet",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Crit Chance",
        "base": 0,
        "perLevel": 0.05
      },
      {
        "name": "Swing Range",
        "base": 0,
        "perLevel": 0.01
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Good Heart",
        "description": "&7Grants &c+{1} Health Regen&7."
      },
      {
        "index": 2,
        "name": "Higher Ground",
        "description": "&7Increases your &9 Crit Damage &7and/&c Strength &7by &c{2}% &7for every/&e0.1 Swing Range &7over &e3 &7(up to /&e6&7)."
      },
      {
        "index": 3,
        "name": "Long Neck",
        "description": "&7Increases your melee damage by/&c{3} &7if you are more than 3 blocks/&7away from the target."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.49,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 35,
            "perLevel": 0.35,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 35,
            "perLevel": 0.35,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.0015,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 50,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.0015,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 50,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.0015,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 50,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "GLACITE_GOLEM": {
    "petType": "Mining Pet",
    "base": [
      {
        "name": "Cold Resistance",
        "base": 0,
        "perLevel": 0.1
      },
      {
        "name": "Mining Speed",
        "base": 0,
        "perLevel": 1.25
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Powder-powered",
        "description": "&7Gain &a+{1}%&7 more &bGlacite Powder &7from/&7most sources."
      },
      {
        "index": 2,
        "name": "Iceborn",
        "description": "&7Gain &a+{2} &6 Mining Fortune &7while in the/&bGlacite Mineshafts&7."
      },
      {
        "index": 3,
        "name": "Frozen Perfection",
        "description": "&7Gain &a+{3} &5 Pristine &7for every/&bFrozen Corpse &7you've looted in the/&7current &bGlacite Mineshaft&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "GOBLIN": {
    "petType": "Mining Pet",
    "base": [
      {
        "name": "Magic Find",
        "base": 0,
        "perLevel": 0.07
      },
      {
        "name": "Ore Fortune",
        "base": 0,
        "perLevel": 1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Grunt Work",
        "description": "&7Gain &6+{1} Mining Speed &7when mining/&6Ores&7."
      },
      {
        "index": 2,
        "name": "Fetid Thief",
        "description": "&7Gain &e+{2} Mining Spread &7while in the/&2Mines of Divan&7."
      },
      {
        "index": 3,
        "name": "Free-range Eggs",
        "description": "&7Increases the chance of finding/&7rare goblin eggs by &a{3}%&7."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 2.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "GOLDEN_DRAGON": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Strength",
        "base": 25,
        "perLevel": 0.25
      },
      {
        "name": "Attack Speed",
        "base": 25,
        "perLevel": 0.25
      },
      {
        "name": "Magic Find",
        "base": 5,
        "perLevel": 0.05
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Gold's Power",
        "description": "&7Increase the potency of &6Midas'/&6Sword &7and &6Midas Staff's &5Greed Ability/&7by &a{1}%"
      },
      {
        "index": 2,
        "name": "Shining Scales",
        "description": "&7Grants &c+11.1 Strength &7and &b+2.2/&bMagic Find &7to your pet for each digit/&7in your &6Gold Collection&7./&8(Max 100M collection)"
      },
      {
        "index": 3,
        "name": "Dragon's Greed",
        "description": "&7Grants &c+{2}% &c Strength &7per &b5/&bMagic Find&7. &8(Max +5%)"
      },
      {
        "index": 4,
        "name": "Legendary Treasure",
        "description": "&7Gain &c{3}% &7damage for every million/&7coins in your bank. &8(Max 250%)"
      },
      {
        "index": 5,
        "name": "Symbiosis",
        "description": "&7If you own a level &a200 Golden/&aDragon&7, gain &6+5 coins &7per monster/&7kill for every other unique maxed/&7Combat Pet that you own."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3,
          4,
          5
        ],
        "variables": {
          "1": {
            "base": 5,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0.25,
            "perLevel": 0.0025,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0.125,
            "perLevel": 0.00125,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 2.5,
            "perLevel": 0.025,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 125,
            "perLevel": 1.25,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "GOLEM": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 1.5
      },
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Swing Range",
        "base": 0,
        "perLevel": 0.01
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Last Stand",
        "description": "&7While at less than &a20% HP&7, reduce/&7incoming damage by &a20%&7. Additionally,/&7gain a temporary shield equal to &a40%/&7of your maximum health and deal &a40%/&7more damage./&8(Lasts 12s, 60s cooldown)"
      },
      {
        "index": 2,
        "name": "Ricochet",
        "description": "&7Your iron plating causes &a{1}% &7of/&7attacks to ricochet and hit the/&7attacker."
      },
      {
        "index": 3,
        "name": "Toss",
        "description": "&7Every 5 hits, throw the enemy up into/&7the air and deal &a5x &7damage &8(5s cooldown)."
      }
    ],
    "abilitiesByTier": {
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "GRANDMA_WOLF": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.25
      },
      {
        "name": "Health",
        "base": 0,
        "perLevel": 1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Kill Combo",
        "description": "&7Gain buffs for combo kills./&7Effects stack as you increase/&7your combo.//&a5 Combo &8(lasts &a{1}s&8)/  &8+&b{7}% &b Magic Find/&a10 Combo &8(lasts &a{2}s&8)/  &8+&6{8} &7coins per kill/&a15 Combo &8(lasts &a{3}s&8)/  &8+&b{9}% &b Magic Find/&a20 Combo &8(lasts &a{4}s&8)/  &8+&3{10}☯ Combat Wisdom/&a25 Combo &8(lasts &a{5}s&8)/  &8+&b{7}% &b Magic Find/&a30 Combo &8(lasts &a{6}s&8)/  &8+&6{8} &7coins per kill"
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 8,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 6,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 4,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 3,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 3,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "6": {
            "base": 2,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "7": {
            "base": 1,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "8": {
            "base": 2,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "9": {
            "base": 1,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "10": {
            "base": 5,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 8,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 6,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 4,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 3,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 3,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "6": {
            "base": 2,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "7": {
            "base": 1,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "8": {
            "base": 4,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "9": {
            "base": 2,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "10": {
            "base": 7,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 8,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 6,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 4,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 3,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 3,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "6": {
            "base": 2,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "7": {
            "base": 2,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "8": {
            "base": 6,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "9": {
            "base": 2,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "10": {
            "base": 9,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 8,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 6,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 4,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 3,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 3,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "6": {
            "base": 2,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "7": {
            "base": 2,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "8": {
            "base": 8,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "9": {
            "base": 3,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "10": {
            "base": 12,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 8,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 6,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 4,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 3,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 3,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "6": {
            "base": 2,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "7": {
            "base": 3,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "8": {
            "base": 10,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "9": {
            "base": 3,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "10": {
            "base": 15,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "GRIFFIN": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Crit Chance",
        "base": 0,
        "perLevel": 0.1
      },
      {
        "name": "Crit Damage",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Attack Speed",
        "base": 0,
        "perLevel": 0.25
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Odyssey",
        "description": "&c{1} &7types of &2 Mythological &7can/&7spawn from &eGriffin Burrows&7. Their/&7stats scale with your Griffin's/&7rarity."
      },
      {
        "index": 2,
        "name": "Sacred Strength",
        "description": "&7Gain &c+{2}% &c Strength/&7when above &c85% &7health."
      },
      {
        "index": 3,
        "name": "King of Kings",
        "description": "&7Grants &b+{3}  Magic Find &7on &2/&2Mythological &7mobs."
      },
      {
        "index": 4,
        "name": "Ancient Earth",
        "description": "&7Grants &d+{4}  Tracking &7on &eGriffin/&eBurrows &7for each burrow excavated/&7in your current chain."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 2,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 4,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 6,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 8,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 10,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 12,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 1,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "GUARDIAN": {
    "petType": "Enchanting Pet",
    "base": [
      {
        "name": "Defense",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Lazerbeam",
        "description": "&7Zaps your enemies for &b{1}x/&b&7your &b Intelligence &7every/&7&a3s."
      },
      {
        "index": 2,
        "name": "Enchanting Wisdom Boost",
        "description": "&7Grants &3+{2}☯ Enchanting/&3Wisdom&7."
      },
      {
        "index": 3,
        "name": "Mana Pool",
        "description": "&7Regenerate &b{3}% &7extra mana,/&7doubled when near or in water."
      },
      {
        "index": 4,
        "name": "Lucky Seven",
        "description": "&7Gain &b+{4}% &7chance to find/&5ultra rare &7books in/&dSuperpairs&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.06,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.07,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "HEDGEHOG": {
    "petType": "Farming Pet",
    "base": [
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.15
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Spiky Quills",
        "description": "&7Deal &a{1}% &7more damage to &2ൠ Pests&7."
      },
      {
        "index": 2,
        "name": "Fearsome Farmer",
        "description": "&7Grants &6+{2} Farming Fortune &7and/&e+{3} Overbloom&7 &7on &2 Pests&7."
      },
      {
        "index": 3,
        "name": "Hunter's Insight",
        "description": "&7Grants &6+{4} Farming Fortune&7 per/&7Pest Bestiary Tier."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.35,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0.7,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "HERMIT_CRAB": {
    "petType": "Fishing Pet",
    "base": [
      {
        "name": "Defense",
        "base": 0,
        "perLevel": 0.2
      },
      {
        "name": "Fishing Speed",
        "base": 0,
        "perLevel": 0.2
      },
      {
        "name": "Sea Creature Chance",
        "base": 0,
        "perLevel": 0.02
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Comfort Zone",
        "description": "&7Grants &b+{1} Fishing Speed &7for &a30s/&7upon catching &6Treasure&7."
      },
      {
        "index": 2,
        "name": "Seafloor Scalper",
        "description": "&6Treasure &7catches are &a{2}% &7more/&7likely to be &6&lGREAT &7or &d&lOUTSTANDING&7."
      },
      {
        "index": 3,
        "name": "Crab Rave",
        "description": "&7Grants &6+{3} Treasure Chance &7for/&7each player with a &aHermit Crab Pet/&7within &a30 &7blocks, up to &a5 &7players."
      },
      {
        "index": 4,
        "name": "Hotspot Hazard",
        "description": "&7Increases the chance of catching/&dHotspot Sea Creatures &7by &a{4}%&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.075,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "HORSE": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "High Stride",
        "description": "&7Grants permanent &bJump Boost II&7."
      },
      {
        "index": 2,
        "name": "High Stride",
        "description": "&7Grants permanent &bJump Boost III&7."
      },
      {
        "index": 3,
        "name": "Stampede",
        "description": "&7Mob kills grant a stack of &f+{1} /&fSpeed &7and &c+{2}  Strength &7for &a5s&7./&8(Max 20 stacks)"
      },
      {
        "index": 4,
        "name": "High Stride",
        "description": "&7Grants permanent &bJump Boost IV&7."
      },
      {
        "index": 5,
        "name": "Trample",
        "description": "&7After falling &a20 &7or more blocks,/&7absorb your fall damage and deal/&a{3}% &7of your weapon's &c Damage &7for/&7every block fallen to mobs within &a3/&7blocks."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {}
      },
      "UNCOMMON": {
        "indices": [
          2
        ],
        "variables": {}
      },
      "RARE": {
        "indices": [
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          4,
          3
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          4,
          3,
          5
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0.5,
            "perLevel": 0.045,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "HOUND": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.4
      },
      {
        "name": "Attack Speed",
        "base": 0,
        "perLevel": 0.25
      },
      {
        "name": "Ferocity",
        "base": 0,
        "perLevel": 0.05
      },
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Scavenger",
        "description": "&7Gain +&a{1} &7coins per monster kill."
      },
      {
        "index": 2,
        "name": "Finder",
        "description": "&7Increases the chance for monsters/&7to drop their armor by &a{2}%&7."
      },
      {
        "index": 3,
        "name": "Pack Slayer",
        "description": "&7Gain &b+{3} &7Combat XP against &aWolves&7."
      }
    ],
    "abilitiesByTier": {
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 1,
            "perLevel": 0.005,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "JADE_DRAGON": {
    "petType": "Foraging Pet",
    "base": [
      {
        "name": "Strength",
        "base": 25,
        "perLevel": 0.25
      },
      {
        "name": "Magic Find",
        "base": 5,
        "perLevel": 0.05
      },
      {
        "name": "Foraging Fortune",
        "base": 25,
        "perLevel": 0.25
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Forest Power",
        "description": "&7Adds &c{1} Strength &7and &f{2} Speed/&7to all your Axes."
      },
      {
        "index": 2,
        "name": "Jade Scale",
        "description": "&7Grants &615 Foraging Fortune &7and/&24 Sweep &7for every digit in your/&aMangrove Collection&7./&8(Max 10M collection)"
      },
      {
        "index": 3,
        "name": "Dragon's Pride",
        "description": "&7Grants &61 Foraging Fortune &7per &25/&2Sweep&7."
      },
      {
        "index": 4,
        "name": "Apex Predator",
        "description": "&7Increases your total &2 Sweep &7by/&20.1% &7for every Maxed out Attribute/&7you unlocked."
      },
      {
        "index": 5,
        "name": "Symbiosis",
        "description": "&7If you own a level &a200 Jade Dragon&7,/&7Grants &6+4 Foraging Fortune for/&7every other unique maxed Foraging/&7Pet that you own.."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3,
          4,
          5
        ],
        "variables": {
          "1": {
            "base": 75,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 37.5,
            "perLevel": 0.125,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "JELLYFISH": {
    "petType": "Alchemy Pet",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 2
      },
      {
        "name": "Health Regen",
        "base": 0,
        "perLevel": 1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Radiant Scyphozoa",
        "description": "&7While in dungeons, reduces the/&7mana cost of/&7Power Orbs by &a{1}%&7."
      },
      {
        "index": 2,
        "name": "Stored Energy",
        "description": "&7While in dungeons, for every/&c2,000 HP &7you heal teammates/&7the cooldown of &aWish &7is/&7reduced by &a{2}s&7, up to/&a30s&7."
      },
      {
        "index": 3,
        "name": "Powerful Potions",
        "description": "&7While in dungeons, increase/&7the effectiveness of Dungeon/&7Potions by &a{3}%"
      }
    ],
    "abilitiesByTier": {
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "JERRY": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": -1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Jerry",
        "description": "&7Gain &a50% &7chance to deal/&7your regular damage."
      },
      {
        "index": 2,
        "name": "Jerry",
        "description": "&7Gain &a100% &7chance to/&7receive a normal amount of drops/&7from mobs."
      },
      {
        "index": 3,
        "name": "Jerry",
        "description": "&7Actually adds &c{1} damage &7to/&7the Aspect of the Jerry."
      },
      {
        "index": 4,
        "name": "Jerry",
        "description": "&7Tiny chance to find Jerry/&7Candies when killing mobs."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1,
          2
        ],
        "variables": {}
      },
      "UNCOMMON": {
        "indices": [
          1,
          2
        ],
        "variables": {}
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {}
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {}
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "KUUDRA": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.4
      },
      {
        "name": "Health",
        "base": 0,
        "perLevel": 4
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Wither Bait",
        "description": "&7Increases the odds of finding/&7a vanquisher by &a{1}%&7."
      },
      {
        "index": 2,
        "name": "Trophy Bait",
        "description": "&7Grants &6+{2} Trophy Chance&7 while/&7on the &cCrimson Isle&f."
      },
      {
        "index": 3,
        "name": "Crimson",
        "description": "&7Grants &a{3}% &7extra Crimson/&7Essence."
      },
      {
        "index": 4,
        "name": "Kuudra Fortune",
        "description": "&7Gain &6+{4} Mining Fortune/&7while on the Crimson Isle."
      },
      {
        "index": 5,
        "name": "Kuudra Specialist",
        "description": "&7Increases all damage to Kuudra and/&7his minions by &c20%&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "LION": {
    "petType": "Foraging Pet",
    "base": [
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Ferocity",
        "base": 0,
        "perLevel": 0.05
      },
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.25
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Primal Force",
        "description": "&7Adds &c+{1} &c Damage &7and/&7&c+{2} &c Strength &7to your/&7weapons."
      },
      {
        "index": 2,
        "name": "First Pounce",
        "description": "&7First Strike&7,/&7Triple-Strike&7, and &d&lCombo/&r&7are &a{3}% &7more effective."
      },
      {
        "index": 3,
        "name": "King of the Jungle",
        "description": "&7Deal &c+{4}% &c Damage/&c&7against mobs that have/&7attacked you."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.03,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.03,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 1.5,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "MAGMA_CUBE": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Defense",
        "base": 0,
        "perLevel": 0.33
      },
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.2
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Slimy Minions",
        "description": "&7Slime and Magma Cube minions work/&a{1}% &a&7faster while on your island"
      },
      {
        "index": 2,
        "name": "Salt Blade",
        "description": "&7Deal &a{2}% &7more damage to slimes"
      },
      {
        "index": 3,
        "name": "Hot Ember",
        "description": "&7Buffs the stats of &5Rekindled Ember/&5Armor &7by &a{3}%."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "MAMMOTH": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Defense",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Cold Resistance",
        "base": 0,
        "perLevel": 0.1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Wooly Coat",
        "description": "&7Gain a &a{1}% &7chance for mobs to not/&7inflict &b Cold &7when damaging you in/&7the &bGlacite Mineshafts&7."
      },
      {
        "index": 2,
        "name": "Tusk Luck",
        "description": "&7Gain &b+{2} Magic Find &7for every/&7100 &6 Mining Fortune&7, doubled in the/&bGlacite Tunnels &7and &bGlacite/&bMineshafts&7."
      },
      {
        "index": 3,
        "name": "Corpse Crusher",
        "description": "&7Gain &6+{3} Mining Fortune &7for each/&bFrozen Corpse &7looted in your/&7current &bGlacite Mineshaft&7."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.005,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "MEGALODON": {
    "petType": "Fishing Pet",
    "base": [
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Ferocity",
        "base": 5,
        "perLevel": 0.05
      },
      {
        "name": "Magic Find",
        "base": 0,
        "perLevel": 0.1
      },
      {
        "name": "Fishing Speed",
        "base": 10,
        "perLevel": 0.3
      },
      {
        "name": "Sea Creature Chance",
        "base": 5,
        "perLevel": 0.05
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Blood Scent",
        "description": "&7Deal up to &c+{1}% &c Damage &7based on/&7the enemy's missing health."
      },
      {
        "index": 2,
        "name": "Enhanced Scales",
        "description": "&7Doubles the pet's base stats during/&7the &bFishing Festival&7."
      },
      {
        "index": 3,
        "name": "Feeding Frenzy",
        "description": "&7Grants a &a{2}% &7chance to catch/&bSharks &7during the &bFishing Festival&7."
      }
    ],
    "abilitiesByTier": {
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 50,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 50,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 10,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "MITHRIL_GOLEM": {
    "petType": "Mining Pet",
    "base": [
      {
        "name": "True Defense",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Mining Fortune",
        "base": 0,
        "perLevel": 0.25
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Mithril Affinity",
        "description": "&7Grants &6+{1}&6 Mining Speed &7when/&7mining &2Mithril&7."
      },
      {
        "index": 2,
        "name": "Subterranean Battler",
        "description": "&7Increases all &cCombat Stats &7by &a+{2}%/&7on &bMining Islands&7."
      },
      {
        "index": 3,
        "name": "The Smell Of Powder",
        "description": "&7Grants &2+{3}% ᠅ Mithril Powder &7from/&7all sources."
      },
      {
        "index": 4,
        "name": "Refined Senses",
        "description": "&7Grants &b+{4}%  Magic Find&7 while on/&bMining Islands&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "MOLE": {
    "petType": "Mining Pet",
    "base": [
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Magic Find",
        "base": 0,
        "perLevel": 0.05
      },
      {
        "name": "Mining Speed",
        "base": 0,
        "perLevel": 1.5
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Archaeologist",
        "description": "&7Increase your chance of finding/&cScavenged Items &7in the &2Mines of/&2Divan &7by {1}&7."
      },
      {
        "index": 2,
        "name": "Magnetic Nose",
        "description": "&9Automatons &7drop their parts &a50%/&7more frequently."
      },
      {
        "index": 3,
        "name": "Nucleic Explorer",
        "description": "&7Gain a {3} &7chance to receive an/&7extra drop when completing the/&dCrystal Nucleus&7."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "MONKEY": {
    "petType": "Foraging Pet",
    "base": [
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.2
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Treeborn",
        "description": "&7Grants &a+{1} &6 Foraging/&6Fortune&7, which increases your/&7chance at double logs."
      },
      {
        "index": 2,
        "name": "Vine Swing",
        "description": "&7Gain +&a{2} &f Speed &7while/&7in The Park."
      },
      {
        "index": 3,
        "name": "Evolved Axes",
        "description": "&7Grants &2{3} Sweep &7while in &aThe Park"
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.6,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.6,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "MONTEZUMA": {
    "petType": "Fractured Soul Pet",
    "base": [
      {
        "name": "Rift Time",
        "base": 25,
        "perLevel": 0
      }
    ],
    "byTier": {
      "EPIC": [
        {
          "name": "Rift Time",
          "base": 25,
          "perLevel": 0
        }
      ]
    },
    "abilities": [
      {
        "index": 1,
        "name": "Nine Lives",
        "description": "&7Gain &a+{1} Rift Time &7per/&7soul piece."
      },
      {
        "index": 2,
        "name": "Trickery",
        "description": "&7Gain &b+{2} Mana Regen &7per/&7soul piece found."
      }
    ],
    "abilitiesByTier": {
      "RARE": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 15,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 15,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 2,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "MOOSHROOM_COW": {
    "petType": "Farming Pet",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Farming Fortune",
        "base": 0,
        "perLevel": 1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Mushroom Eater",
        "description": "&7You have a &a+{1} &7chance to drop a/&7Mushroom when farming crops."
      },
      {
        "index": 2,
        "name": "Farming Strength",
        "description": "&7Grants &6+0.7 Farming Fortune for/&7every &c{2}  Strength &7you have."
      },
      {
        "index": 3,
        "name": "Bovine Blessing",
        "description": "&7You have a &a+{3}% &7chance to find/&aTasty Cheese &7or &aDung &7when farming/&7crops."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 40,
            "perLevel": -0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 40,
            "perLevel": -0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 40,
            "perLevel": -0.2,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.0002,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "MOSQUITO": {
    "petType": "Farming Pet",
    "base": [
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.2
      },
      {
        "name": "Bonus Pest Chance",
        "base": 0,
        "perLevel": 0.5
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Smooth Jazz",
        "description": "&7Pest Vinyls are &a+{1}% &7more effective."
      },
      {
        "index": 2,
        "name": "Buzzin' Barterer",
        "description": "&7Gain &6+{2} Sugar Cane Fortune &7for/&7every unique visitor you've served/&7in &aThe Garden&7./&8Your Bonus: # Sugar Cane Fortune/&8Capped at 175 Fortune"
      },
      {
        "index": 3,
        "name": "Bloodsucker's Betrayal",
        "description": "&7When collected, &2Pest Traps &7will catch/&7the next pest &a{3}% &7faster."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.35,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "OCELOT": {
    "petType": "Foraging Pet",
    "base": [
      {
        "name": "Ferocity",
        "base": 0,
        "perLevel": 0.1
      },
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.5
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Foraging Wisdom Boost",
        "description": "&7Grants &3+{1}☯ Foraging/&3Wisdom&7."
      },
      {
        "index": 2,
        "name": "Tree Hugger",
        "description": "&7Foraging minions work &a{2}%/&a&7faster while on your island."
      },
      {
        "index": 3,
        "name": "Tree Essence",
        "description": "&7Gain a &a{3}% &7chance to get/&7exp from breaking a log."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "ORCHID_MANTIS": {
    "petType": "Farming Pet",
    "base": [
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.3
      },
      {
        "name": "Overbloom",
        "base": 0,
        "perLevel": 0.15
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Intelligent Specimen",
        "description": "&7Earn &a+{1}% &7more Farming Tool Exp."
      },
      {
        "index": 2,
        "name": "Swift Sickles",
        "description": "&7Convert every &f3 &f Speed &7you have/&7above &f100 &7into &6+{2} Farming/&6Fortune."
      },
      {
        "index": 3,
        "name": "Orchid Nectar",
        "description": "&7You have a &a+{3}% &7chance to find/&aJelly &7or &aPlant Matter &7when farming/&7crops."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.005,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.0002,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "OWL": {
    "petType": "Taming Pet",
    "base": [],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Training Refunds",
        "description": "&7The more coins to spend on/&7Fann's Sessions, the less coins/&7they will cost. &8(max 5% off)."
      },
      {
        "index": 2,
        "name": "Efficient Trainer",
        "description": "&7Makes training sessions at/&7Fann more efficient when added/&7into a session.//&7Increased EXP: &b+{1}% EXP"
      },
      {
        "index": 3,
        "name": "Fast Learner",
        "description": "&7Passively grants &3+{2}☯ Taming/&3Wisdom"
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0.1,
            "perLevel": 0.099,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0.05,
            "perLevel": 0.045,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "PARROT": {
    "petType": "Alchemy Pet",
    "base": [
      {
        "name": "Crit Damage",
        "base": 0,
        "perLevel": 0.1
      },
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Flamboyant",
        "description": "&7Adds &a{1} &7levels to/&7intimidation accessories."
      },
      {
        "index": 2,
        "name": "Repeat",
        "description": "&7Boosts potions duration by/&7&a{2}%"
      },
      {
        "index": 3,
        "name": "Bird Discourse",
        "description": "&7Gives &c+{3} Strength &7to/&7players within &a20 &7blocks/&8Doesn't stack."
      },
      {
        "index": 4,
        "name": "Parrot Feather Infusion",
        "description": "&7When summoned or in your pets/&7menu, boost the duration of/&7consumed &cGod Potions &7by/&7&a{4}%"
      }
    ],
    "abilitiesByTier": {
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0,
            "roundDown": false,
            "eval": "Parrot"
          },
          "2": {
            "base": 5,
            "perLevel": 0.35,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0,
            "perLevel": 7,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0,
            "roundDown": false,
            "eval": "Parrot"
          },
          "2": {
            "base": 5,
            "perLevel": 0.35,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 5,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0,
            "perLevel": 5,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "PENGUIN": {
    "petType": "Fishing Pet",
    "base": [
      {
        "name": "Sea Creature Chance",
        "base": 0,
        "perLevel": 0.1
      },
      {
        "name": "Cold Resistance",
        "base": 0,
        "perLevel": 0.15
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Thick Blubber",
        "description": "&7Each time you catch a Sea Creature,/&7reduce your &b Cold &7by &a{1}&7."
      },
      {
        "index": 2,
        "name": "Chilly Reception",
        "description": "&7Grants &b+{2} Cold Resistance &7for/&7each player within &a30 &7blocks, up to/&a10 &7players."
      },
      {
        "index": 3,
        "name": "Subzero Hero",
        "description": "&7Gain &b+{3} Fishing Speed&7 while in the/&bGlacite Tunnels&7."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.05,
            "roundDown": true,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "PHOENIX": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Strength",
        "base": 10,
        "perLevel": 0.5
      },
      {
        "name": "Intelligence",
        "base": 50,
        "perLevel": 1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Rekindle",
        "description": "&7Before death, become &eimmune/&e&7and gain &c{1} &c Strength/&c&7for &a{2} &7seconds./&81 minute cooldown"
      },
      {
        "index": 2,
        "name": "Fourth Flare",
        "description": "&7On 4th melee strike, &6ignite/&6&7mobs, dealing &c{3}x &7your &9/&9Crit Damage &7each second for/&7&a{4} &7seconds."
      },
      {
        "index": 3,
        "name": "Magic Bird",
        "description": "&7You may always fly on your/&7private island."
      },
      {
        "index": 4,
        "name": "Eternal Coins",
        "description": "&7Don't lose coins from death."
      }
    ],
    "abilitiesByTier": {
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 10,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 2,
            "perLevel": 0.02,
            "roundDown": true,
            "eval": null
          },
          "3": {
            "base": 1,
            "perLevel": 0.12,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 2,
            "perLevel": 0.02,
            "roundDown": true,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 15,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 2,
            "perLevel": 0.02,
            "roundDown": true,
            "eval": null
          },
          "3": {
            "base": 1,
            "perLevel": 0.14,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 2,
            "perLevel": 0.03,
            "roundDown": true,
            "eval": null
          }
        }
      }
    }
  },
  "PIG": {
    "petType": "Farming Pet",
    "base": [
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.15
      },
      {
        "name": "Potato Fortune",
        "base": 0,
        "perLevel": 0.2
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Hamfisted",
        "description": "&7Increases &6Coin &7gain from &6Shiny Pigs/&7by &a{1}%&7."
      },
      {
        "index": 2,
        "name": "Shining Stampede",
        "description": "&7Grants &6+{2} Potato Fortune &7per/&6Shiny Pig &3Bestiary &7tier."
      },
      {
        "index": 3,
        "name": "Pig Parade",
        "description": "&7Increases the base stats of this pet/&7by &a{3}% &7during the &dYear of the Pig&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.35,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.35,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.04,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "PIGMAN": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Defense",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Ferocity",
        "base": 0,
        "perLevel": 0.05
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Bacon Farmer",
        "description": "&7Pig minions work &a{1}%/&a&7faster while on your island."
      },
      {
        "index": 2,
        "name": "Pork Master",
        "description": "&7Buffs the Pigman sword by &a{2}/&a&c Damage &7and &a{3} &c/&cStrength."
      },
      {
        "index": 3,
        "name": "Giant Slayer",
        "description": "&7Deal &c+50% &7damage to monsters Level/&a50+ &7and &c+75% damage to monsters/&7Level &a100+&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "PRECURSOR_DRONE": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Sea Creature Chance",
        "base": 0,
        "perLevel": 0.1
      },
      {
        "name": "Mining Fortune",
        "base": 0,
        "perLevel": 0.3
      },
      {
        "name": "Foraging Fortune",
        "base": 0,
        "perLevel": 0.3
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Contraband",
        "description": "&7Catching a &3Sea Creature &7has a &a10%/&7chance to also give you &6Treasure&7."
      },
      {
        "index": 2,
        "name": "Grungle",
        "description": "&7You can now ONLY throw your/&7Foraging Axe, but it has &cno throwing/&cpenalty&7 anymore."
      },
      {
        "index": 3,
        "name": "Mining Off Camera",
        "description": "&7While mining, each collection/&7progress grants a &a0.005% &7chance to/&7drop a random enchanted mining item."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {}
      }
    }
  },
  "RABBIT": {
    "petType": "Farming Pet",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.2
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Happy Feet",
        "description": "&7Jump potions also give &a+{1}/&a&7speed."
      },
      {
        "index": 2,
        "name": "Farming Wisdom Boost",
        "description": "&7Gives &3+{2}☯ Farming/&3Wisdom&7."
      },
      {
        "index": 3,
        "name": "Efficient Farming",
        "description": "&7Farming minions work &a{3}%/&a&7faster while on your island."
      },
      {
        "index": 4,
        "name": "Chocolate Injections",
        "description": "&7Increases &6Chocolate Factory/&7production by &a+{4}x&7. Duplicate/&aChocolate Rabbits&7 that you find/&7grant &6+{5}% Chocolate."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0.01,
            "perLevel": 0.0004,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 1.3,
            "perLevel": 0.32,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "RAT": {
    "petType": "Combat Morph",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 1.25
      },
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.6
      },
      {
        "name": "Crit Damage",
        "base": 0,
        "perLevel": 0.25
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Morph",
        "description": "&7Right-click your summoned pet/&7to morph into it!"
      },
      {
        "index": 2,
        "name": "CHEESE!",
        "description": "&7As a Rat, you smell/&7&e&lCHEESE&r&7 nearby! Yummy!"
      },
      {
        "index": 3,
        "name": "Rat's Blessing",
        "description": "&7Has a chance to grant a random/&7player &b+{1} Magic Find&7 for/&7&a{2}&7 seconds after finding a/&7yummy piece of Cheese! If the/&7player gets a drop during this/&7buff, you have a &a20% &7chance/&7to get it too."
      },
      {
        "index": 4,
        "name": "Extreme Speed",
        "description": "&7The Rat is TWO times faster."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 2,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 20,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 2,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 20,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "REINDEER": {
    "petType": "Fishing Pet",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Fishing Speed",
        "base": 0,
        "perLevel": 0.25
      },
      {
        "name": "Sea Creature Chance",
        "base": 0,
        "perLevel": 0.05
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Winter Spirit",
        "description": "&7Gain &ddouble &7pet &aEXP&7."
      },
      {
        "index": 2,
        "name": "Infused",
        "description": "&7Gives &b+{1}&b Fishing Speed &7and &6+5/&6Treasure Chance &7while on &cJerry's/&cWorkshop&7."
      },
      {
        "index": 3,
        "name": "Snow Power",
        "description": "&7Grants &a+{2}% &7bonus gift/&7chance during the &cGift Attack/&c&7event."
      },
      {
        "index": 4,
        "name": "Icy Wind",
        "description": "&7Grants &a+{3}% &7chance of/&7getting double &bIce Essence&7."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "RIFT_FERRET": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": -0.02
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Orbs are Fun",
        "description": "&7Gain &a+{1}% &7experience from/&bXP Orbs&7."
      }
    ],
    "abilitiesByTier": {
      "EPIC": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 10,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 10,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "ROCK": {
    "petType": "Mining Mount",
    "base": [
      {
        "name": "Defense",
        "base": 0,
        "perLevel": 2
      },
      {
        "name": "True Defense",
        "base": 0,
        "perLevel": 0.1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Rideable",
        "description": "&7Right-click your summoned pet/&7to ride it!"
      },
      {
        "index": 2,
        "name": "Sailing Stone",
        "description": "&7Sneak to move your rock to/&7your location (15s cooldown)."
      },
      {
        "index": 3,
        "name": "Fortify",
        "description": "&7While sitting on your rock,/&7gain +&a{1}% &7defense."
      },
      {
        "index": 4,
        "name": "Steady Ground",
        "description": "&7While sitting on your rock,/&7gain &c+{2}x &7damage."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1,
          2
        ],
        "variables": {}
      },
      "UNCOMMON": {
        "indices": [
          1,
          2
        ],
        "variables": {}
      },
      "RARE": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "ROSE_DRAGON": {
    "petType": "Farming Pet",
    "base": [
      {
        "name": "Speed",
        "base": 50,
        "perLevel": 0.5
      },
      {
        "name": "Farming Fortune",
        "base": 20,
        "perLevel": 0.2
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Garden Power",
        "description": "&7Grants +&6{1} Farming Fortune per/&aFarming &7level."
      },
      {
        "index": 2,
        "name": "Rosy Scales",
        "description": "&7Grants &60.15 Farming Fortune &7and/&f0.1 Speed&7 per Crop Milestone."
      },
      {
        "index": 3,
        "name": "Dragon's Gluttony",
        "description": "&7Grants &e+{4} Overbloom&7."
      },
      {
        "index": 4,
        "name": "Spiritual Perfection",
        "description": "&7Gain &a20% &7more &cCopper &7from &aGarden/&aVisitors&7 and from analyzing &eMutations&7."
      },
      {
        "index": 5,
        "name": "Symbiosis",
        "description": "&7If you own a level &a200 Rose Dragon&7,/&7Grants &6+3 Farming Fortune for/&7every other unique maxed Farming/&7Pet that you own."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3,
          4,
          5
        ],
        "variables": {
          "1": {
            "base": 1.5,
            "perLevel": 0.015,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0.075,
            "perLevel": 0.00075,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0.05,
            "perLevel": 0.0005,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 20,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 10,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "SCATHA": {
    "petType": "Mining Pet",
    "base": [
      {
        "name": "Mining Speed",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Mining Fortune",
        "base": 0,
        "perLevel": 1.25
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Burrowing",
        "description": "&7Grants a &a+{1}% &7chance to find/&eTreasure Chests &7while mining."
      },
      {
        "index": 2,
        "name": "Drill Infusion",
        "description": "&7Grants &6+{2} Gemstone Fortune &7to/&7Drills."
      },
      {
        "index": 3,
        "name": "Bejeweled Eyes",
        "description": "&7Earn &a+{3}% &dGemstone Powder &7from all/&7sources."
      }
    ],
    "abilitiesByTier": {
      "RARE": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1.25,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "SEAL": {
    "petType": "Fishing Pet",
    "base": [
      {
        "name": "Fishing Speed",
        "base": 0,
        "perLevel": 0.35
      },
      {
        "name": "Sea Creature Chance",
        "base": 0,
        "perLevel": 0.05
      },
      {
        "name": "Treasure Chance",
        "base": 0,
        "perLevel": 0.01
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Showboater",
        "description": "&7Increases your chance of catching/&5Bouncy Beach Balls &7and &6Giant Bouncy/&6Beach Balls &7during the &9Year of the/&9Seal &7by &a{1}%&7."
      },
      {
        "index": 2,
        "name": "Peak Performance",
        "description": "&7Gain a &a{2}% &7chance to materialize/&7some &9Treasure Bait &7in your/&7inventory upon catching &6Treasure&7. /&7Materializes &aGolden Bait &7instead /&7during the &9Year of the Seal&7."
      },
      {
        "index": 3,
        "name": "Amphibious",
        "description": "&7Increases the base stats of this pet/&7by &a{3}% &7during the &9Year of the Seal&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.035,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "SHEEP": {
    "petType": "Alchemy Pet",
    "base": [
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Ability Damage",
        "base": 0,
        "perLevel": 0.2
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Mana Saver",
        "description": "&7Reduces the mana cost of/&7abilities by &a{1}%"
      },
      {
        "index": 2,
        "name": "Overheal",
        "description": "&7Gives a &a{2}% &7shield after/&7not taking damage for 10s."
      },
      {
        "index": 3,
        "name": "Dungeon Wizard",
        "description": "&7Increases your total mana by/&7&a{3}% &7while in dungeons."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "SILVERFISH": {
    "petType": "Mining Pet",
    "base": [
      {
        "name": "Defense",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Mining Fortune",
        "base": 0,
        "perLevel": 0.2
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Magnetic",
        "description": "&7Earn &a+{1}% &7more Exp when mining."
      },
      {
        "index": 2,
        "name": "Experienced Burrower",
        "description": "&7Grants &3+{2}☯ Mining Wisdom&7."
      },
      {
        "index": 3,
        "name": "Dexterity",
        "description": "&7Grants &6+{3} Mining Speed &7and/&7permanent &eHaste I\\/II\\/III&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 1.5,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "SKELETON": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Crit Chance",
        "base": 0,
        "perLevel": 0.15
      },
      {
        "name": "Crit Damage",
        "base": 0,
        "perLevel": 0.3
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Bone Arrows",
        "description": "&7Increase arrow damage by &a{1}%/&7which is doubled while in dungeons."
      },
      {
        "index": 2,
        "name": "Combo",
        "description": "&7Gain a combo stack for every bow hit/&7granting +&a3 &c Strength&7. Max &a{2}/&7stacks, stacks disappear after 8/&7seconds."
      },
      {
        "index": 3,
        "name": "Skeletal Defense",
        "description": "&7Your skeleton shoots an arrow/&7dealing &a30x &7your &9 Crit Damage/&7when a mob gets close to you (5s/&7cooldown)."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.35,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.17,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "SKELETON_HORSE": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 0.75
      },
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 1.5
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "High Stride",
        "description": "&7Grants permanent &bJump Boost IV&7."
      },
      {
        "index": 2,
        "name": "Stampede",
        "description": "&7Mob kills grant a stack of &e+{1} /&eAttack Speed &7and &c+{2}  Strength/&7for &a5s&7./&8(Max 20 stacks)"
      },
      {
        "index": 3,
        "name": "Trample",
        "description": "&7After falling &a20 &7or more blocks,/&7absorb your fall damage and deal &a{3}%/&7of your weapon's &c Damage &7for/&7every block fallen to mobs within &a3/&7blocks."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0.75,
            "perLevel": 0.0625,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "SLOTH": {
    "petType": "Foraging Pet",
    "base": [
      {
        "name": "Sweep",
        "base": 0,
        "perLevel": 0.1
      },
      {
        "name": "Foraging Fortune",
        "base": 0,
        "perLevel": 0.25
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Slow Start",
        "description": "&7Every &a60s&7, your next cut gains/&2+{1}  Sweep &7and &6+{2}  Foraging/&6Fortune&7."
      },
      {
        "index": 2,
        "name": "Stronk Arm",
        "description": "&7Gains &2+{3}  Sweep &7and &6+{4}/&6Foraging Fortune &7on &2Axe &7throws."
      },
      {
        "index": 3,
        "name": "Starlyn's Favorite",
        "description": "&7Cutting &aTrees &7give &a+{5}% &7more points/&7towards &dStarlyn Contests&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "SLUG": {
    "petType": "Farming Pet",
    "base": [
      {
        "name": "Defense",
        "base": 0,
        "perLevel": 0.2
      },
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 0.25
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Slow and Steady",
        "description": "&7When fishing in the &cCrimson/&cIsle&7, &aSlugfish &7take &a{1}%/&7less time to catch."
      },
      {
        "index": 2,
        "name": "Pest Friends",
        "description": "&7Grants &2+{2} Bonus Pest/&2Chance&7."
      },
      {
        "index": 3,
        "name": "Repugnant Aroma",
        "description": "&7When farming in a plot/&7affected by a &aSprayonator&7,/&7gain &6+{3} Farming Fortune&7."
      }
    ],
    "abilitiesByTier": {
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "SNAIL": {
    "petType": "Mining Pet",
    "base": [
      {
        "name": "Defense",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Red Sand Enjoyer",
        "description": "&9Red Sand Minions &7work &a{1}% &7faster/&7while on your &bPrivate Island&7."
      },
      {
        "index": 2,
        "name": "Slow and Steady",
        "description": "&7Convert every &f{2} Speed &7you have/&7above &f100 &7into &6+1 Block Fortune&7."
      },
      {
        "index": 3,
        "name": "Slimy Reach",
        "description": "&7Grants &e+{3} Mining Spread &7while/&7mining &9Blocks&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 6,
            "perLevel": -0.03,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 6,
            "perLevel": -0.03,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 5,
            "perLevel": -0.03,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 4,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "SNOWMAN": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Damage",
        "base": 0,
        "perLevel": 0.25
      },
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.25
      },
      {
        "name": "Crit Damage",
        "base": 0,
        "perLevel": 0.25
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Blizzard",
        "description": "&7Enemies within &a{1} &7blocks are slowed/&7by &a25% &7and deal &a{2}% &7less damage."
      },
      {
        "index": 2,
        "name": "Frostbite",
        "description": "&7Your freezing aura slows enemy/&7attacks causing you to take &a{3}%/&7reduced damage."
      },
      {
        "index": 3,
        "name": "Snow Cannon",
        "description": "&7Shoots a snowball towards an enemy/&7when you attack dealing &a{4}% &7of/&7your last dealt melee damage,/&7capped at &f200,000&7. &8(1s cooldown)."
      },
      {
        "index": 4,
        "name": "Ouch!",
        "description": "&7Your snowballs have &a50% &7chance of/&7dealing &cdouble &7damage!"
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 8,
            "perLevel": 0.08,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 10,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 8,
            "perLevel": 0.08,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 10,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "SPIDER": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Crit Chance",
        "base": 0,
        "perLevel": 0.1
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "One With the Spider",
        "description": "&7Applies &c{1}  Strength &7to all/&4Arachnal  &7weapons, armor, and/&7equipment you have equipped."
      },
      {
        "index": 2,
        "name": "Web-Weaver",
        "description": "&7Upon hitting a monster it becomes/&7slowed by &a{2}%"
      },
      {
        "index": 3,
        "name": "Spider Whisperer",
        "description": "&7Spider, Cave Spider and Tarantula/&7minions work &a{3}% &7faster while on/&7your island."
      },
      {
        "index": 4,
        "name": "Web Battlefield",
        "description": "&7Killing mobs grants &c+{4} &cStrength/&7and &b+{5} Magic Find &7for &a40s &7to all /&7players staying within &a20 &7blocks of/&7where they died. &8Stacks up to 10/&8times."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 1,
            "perLevel": 0.02,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 2,
            "perLevel": 0.04,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 3,
            "perLevel": 0.06,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 4,
            "perLevel": 0.08,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 5,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 5,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.06,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "SPINOSAURUS": {
    "petType": "Fishing Pet",
    "base": [
      {
        "name": "Fishing Speed",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Sea Creature Chance",
        "base": 0,
        "perLevel": 0.05
      },
      {
        "name": "Trophy Chance",
        "base": 0,
        "perLevel": 0.05
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Sharp Attitude",
        "description": "&bSea Creatures &7spawn with &a{1}% &7of/&7their maximum health missing."
      },
      {
        "index": 2,
        "name": "Pursuit",
        "description": "&7Increases the chance of catching/&6&lGOLD&r&7 and &b&lDIAMOND&r&7 tier &6Trophy/&6Fish &7by &a{2}%&7."
      },
      {
        "index": 3,
        "name": "Primordial Fisher",
        "description": "&7Increases this pet's base stats by/&a{3}% &7during &brain&7."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "SPIRIT": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.3
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Spirit Assistance",
        "description": "&7Spawns and assists you when/&7you are a ghost in Dungeons."
      },
      {
        "index": 2,
        "name": "Spirit Cooldowns",
        "description": "&7Reduces the cooldown of your/&7ghost abilities in dungeons by/&7&a{1}%&7."
      },
      {
        "index": 3,
        "name": "Half Life",
        "description": "&7If you are the first player to/&7die in a dungeon, the score/&7penalty for that death is/&7reduced to &a1&7."
      }
    ],
    "abilitiesByTier": {
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 5,
            "perLevel": 0.45,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 5,
            "perLevel": 0.45,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "SQUID": {
    "petType": "Fishing Pet",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 0.5
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "More Ink",
        "description": "&7Gain a &a{1}% &7chance to get/&7double drops from squids."
      },
      {
        "index": 2,
        "name": "Ink Specialty",
        "description": "&7Buffs the &5Ink Wand &7by &a{2} &c/&cDamage &7and &a{3} &c Strength."
      },
      {
        "index": 3,
        "name": "Fishing Wisdom Boost",
        "description": "&7Gives &3+{4}☯ Fishing/&3Wisdom&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "TYRANNOSAURUS": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.75
      },
      {
        "name": "Crit Chance",
        "base": 0,
        "perLevel": 0.05
      },
      {
        "name": "Ferocity",
        "base": 0,
        "perLevel": 0.25
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Close Combat",
        "description": "&7Deal &a{1}% &7more &cdamage &7to enemies/&7within 1.5 blocks."
      },
      {
        "index": 2,
        "name": "Ferocious Roar",
        "description": "&7Attacks have a &a{2}% &7chance to stun/&7the target &8(10s cooldown)."
      },
      {
        "index": 3,
        "name": "Tyrant",
        "description": "&7Combat stats granted by pet items on/&7this pet are increased by &a{3}%&7."
      }
    ],
    "abilitiesByTier": {
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "TARANTULA": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.1
      },
      {
        "name": "Crit Chance",
        "base": 0,
        "perLevel": 0.1
      },
      {
        "name": "Crit Damage",
        "base": 0,
        "perLevel": 0.3
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Webbed Cells",
        "description": "&cTarantula Broodfather's &4 Vitality/&7reduction is &a{1}% &7less effective/&7against you."
      },
      {
        "index": 2,
        "name": "Eight Legs",
        "description": "&7Decreases the mana cost of/&7Spider, Tarantula and Spirit/&7boots by &a{2}%"
      },
      {
        "index": 3,
        "name": "Arachnid Slayer",
        "description": "&7Gain &b{3}x &7Combat XP/&7against &aSpiders&7."
      },
      {
        "index": 4,
        "name": "Web Battlefield",
        "description": "&7Killing mobs grants &c+{4}/&cStrength &7and &b+{5} Magic Find/&7for &a40s &7to all players/&7staying within &a20 &7blocks/&7of where they died. &8Stacks/&8up to 10 times."
      }
    ],
    "abilitiesByTier": {
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 1,
            "perLevel": 0.005,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "MYTHIC": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 1,
            "perLevel": 0.005,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 0,
            "perLevel": 0.06,
            "roundDown": false,
            "eval": null
          },
          "5": {
            "base": 0,
            "perLevel": 0.01,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "TIGER": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Strength",
        "base": 5,
        "perLevel": 0.1
      },
      {
        "name": "Crit Chance",
        "base": 0,
        "perLevel": 0.05
      },
      {
        "name": "Crit Damage",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "Ferocity",
        "base": 0,
        "perLevel": 0.25
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Merciless Swipe",
        "description": "&7Gain &c+{1}% &c Ferocity."
      },
      {
        "index": 2,
        "name": "Hemorrhage",
        "description": "&7Melee attacks reduce healing/&7by &6{2}% &7for &a10s."
      },
      {
        "index": 3,
        "name": "Apex Predator",
        "description": "&7Deal &c+{3}% &7damage against/&7targets with no other mobs/&7within &a15 &7blocks."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.55,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.55,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "TURTLE": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Health",
        "base": 50,
        "perLevel": 0.25
      },
      {
        "name": "Defense",
        "base": 100,
        "perLevel": 0.5
      },
      {
        "name": "True Defense",
        "base": 0,
        "perLevel": 0.15
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Turtle Tactics",
        "description": "&7Gain &a+{1}%  Defense &7and an/&7additional &a+10% &a Defense &7when/&7standing still."
      },
      {
        "index": 2,
        "name": "Genius Amniote",
        "description": "&7Grants &a+{2}%  Defense &7to 4/&7players within 50 blocks of you."
      },
      {
        "index": 3,
        "name": "Unflippable",
        "description": "&7Gain &aimmunity &7to knockback."
      },
      {
        "index": 4,
        "name": "Turtle Shell",
        "description": "&7When under &c40% &7maximum HP, you take/&a{3}% &7less damage. Gain &4+{4} &4Vitality/&7after taking 10 hits."
      }
    ],
    "abilitiesByTier": {
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 3,
            "perLevel": 0.27,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.015,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 3,
            "perLevel": 0.27,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.015,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 5,
            "perLevel": 0.05,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "DROPLET_WISP,FROST_WISP,GLACIAL_WISP,SUBZERO_WISP": {
    "petType": "Gabagool Pet, feed to gain XP",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Damage",
        "base": 0,
        "perLevel": 0.1
      }
    ],
    "byTier": {
      "RARE": [
        {
          "name": "Health",
          "base": 0,
          "perLevel": 2.5
        },
        {
          "name": "True Defense",
          "base": 0,
          "perLevel": 0.15
        },
        {
          "name": "Damage",
          "base": 0,
          "perLevel": 0.15
        },
        {
          "name": "Intelligence",
          "base": 0,
          "perLevel": 0.5
        }
      ],
      "EPIC": [
        {
          "name": "Health",
          "base": 0,
          "perLevel": 4
        },
        {
          "name": "True Defense",
          "base": 0,
          "perLevel": 0.3
        },
        {
          "name": "Damage",
          "base": 0,
          "perLevel": 0.2
        },
        {
          "name": "Intelligence",
          "base": 0,
          "perLevel": 1.25
        }
      ],
      "LEGENDARY": [
        {
          "name": "Health",
          "base": 0,
          "perLevel": 6
        },
        {
          "name": "True Defense",
          "base": 0,
          "perLevel": 0.35
        },
        {
          "name": "Damage",
          "base": 0,
          "perLevel": 0.25
        },
        {
          "name": "Intelligence",
          "base": 0,
          "perLevel": 2.5
        }
      ]
    },
    "abilities": [
      {
        "index": 1,
        "name": "Drophammer",
        "description": "&7Lets you break fire pillars &a2x/&7faster, healing you for &c{1}% &7of your/&7max &c &7over &a3s&7."
      },
      {
        "index": 2,
        "name": "Bulwark",
        "description": "&7Kill Blazes to gain defense against/&7them and demons./&7Bonus: &a+0 & &f+0/&7Next Upgrade: &a+30 & &f+3 &8(&a0&7\\/&c100&8)"
      },
      {
        "index": 3,
        "name": "Blaze Slayer",
        "description": "&7Gain &b{2}x &7Combat XP &7against &aBlazes&7."
      },
      {
        "index": 4,
        "name": "Extinguish",
        "description": "&7While in combat on the Crimson Isle,/&7spawn a pool every &a8s&7./&7Bathing in it heals &c{2}% &7now and/&c{3}%&7\\/s for &a8s&7."
      },
      {
        "index": 5,
        "name": "Ephemeral Stability",
        "description": "&7Regenerate mana &b40% &7faster"
      },
      {
        "index": 6,
        "name": "Icehammer",
        "description": "&7Lets you break fire pillars &a2x/&7faster, healing you for &c{1}% &7of your/&7max &c &7over &a3s&7."
      }
    ],
    "abilitiesByTier": {
      "UNCOMMON": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 15,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.003,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          6,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 25,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.004,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 15,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 4,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          6,
          2,
          3,
          4
        ],
        "variables": {
          "1": {
            "base": 40,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.0045,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 20,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 7,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          6,
          2,
          3,
          4,
          5
        ],
        "variables": {
          "1": {
            "base": 50,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 1,
            "perLevel": 0.005,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 25,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          },
          "4": {
            "base": 10,
            "perLevel": 0,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "WITCH": {
    "petType": "Alchemy Pet",
    "base": [
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Alchemy Wisdom",
        "base": 0,
        "perLevel": 0.05
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Toil and Trouble",
        "description": "&7Increases your chance of dropping/&6Ingredients &7during the &5Year of the/&5Witch by &a{1}%&7."
      },
      {
        "index": 2,
        "name": "Alchemism",
        "description": "&7Reduces how long &5Potions &7take to/&7brew by &a{2}%&7."
      },
      {
        "index": 3,
        "name": "Witching Hour",
        "description": "&7Increases the base stats of this pet/&7by &a{3}% &7during the &5Year of the Witch&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.75,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.4,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.5,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "WITHER_SKELETON": {
    "petType": "Mining Pet",
    "base": [
      {
        "name": "Defense",
        "base": 0,
        "perLevel": 0.25
      },
      {
        "name": "Strength",
        "base": 0,
        "perLevel": 0.25
      },
      {
        "name": "Crit Chance",
        "base": 0,
        "perLevel": 0.05
      },
      {
        "name": "Crit Damage",
        "base": 0,
        "perLevel": 0.25
      },
      {
        "name": "Intelligence",
        "base": 0,
        "perLevel": 0.25
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Stronger Bones",
        "description": "&7Take &a{1}% &7less damage from &f/&fSkeletal &7mobs."
      },
      {
        "index": 2,
        "name": "Wither Blood",
        "description": "&7Deal &a{2}% &7more damage to &8 Wither/&7mobs."
      },
      {
        "index": 3,
        "name": "Death's Touch",
        "description": "&7Upon hitting an enemy inflict/&7the wither effect for &a{3}%/&7damage over 3 seconds./&8Does not stack"
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 1,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 2,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "WOLF": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 0.5
      },
      {
        "name": "True Defense",
        "base": 0,
        "perLevel": 0.1
      },
      {
        "name": "Crit Damage",
        "base": 0,
        "perLevel": 0.1
      },
      {
        "name": "Speed",
        "base": 0,
        "perLevel": 0.2
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Alpha Dog",
        "description": "&7Take &a{1}% &7less damage from/&7wolves."
      },
      {
        "index": 2,
        "name": "Pack Leader",
        "description": "&7Gain &a{2} &9 Crit Damage/&9&7for every nearby wolf monsters./&8Max 10 wolves"
      },
      {
        "index": 3,
        "name": "Combat Wisdom Boost",
        "description": "&7Grants &3+{3}☯ Combat/&3Wisdom&7."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.2,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 0,
            "perLevel": 0.15,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.3,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  },
  "ZOMBIE": {
    "petType": "Combat Pet",
    "base": [
      {
        "name": "Health",
        "base": 0,
        "perLevel": 1
      },
      {
        "name": "Crit Damage",
        "base": 0,
        "perLevel": 0.3
      }
    ],
    "byTier": {},
    "abilities": [
      {
        "index": 1,
        "name": "Bite Shield",
        "description": "&7Reduce the damage taken from/&7zombies by &a{1}%&7."
      },
      {
        "index": 2,
        "name": "Rotten Blade",
        "description": "&7Deal &a{2}% &7more damage to &2 Undead/&7mobs"
      },
      {
        "index": 3,
        "name": "Living Dead",
        "description": "&7Increases all stats on/&2Undead ༕ &7armor by &a{3}%."
      }
    ],
    "abilitiesByTier": {
      "COMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 5,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "UNCOMMON": {
        "indices": [
          1
        ],
        "variables": {
          "1": {
            "base": 10,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "RARE": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 10,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 25,
            "perLevel": 1.25,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "EPIC": {
        "indices": [
          1,
          2
        ],
        "variables": {
          "1": {
            "base": 15,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 25,
            "perLevel": 1.25,
            "roundDown": false,
            "eval": null
          }
        }
      },
      "LEGENDARY": {
        "indices": [
          1,
          2,
          3
        ],
        "variables": {
          "1": {
            "base": 15,
            "perLevel": 0.1,
            "roundDown": false,
            "eval": null
          },
          "2": {
            "base": 25,
            "perLevel": 1.25,
            "roundDown": false,
            "eval": null
          },
          "3": {
            "base": 0,
            "perLevel": 0.25,
            "roundDown": false,
            "eval": null
          }
        }
      }
    }
  }
};
