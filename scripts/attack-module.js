/**
 * Class describing a single Attack
 */
class Attack {
    /**
     * Title of the attack
     * @type { string }
     */
    title;

    /**
     * If the attack should roll to hit or not
     * @type { boolean }
     */
    rollToHit = true;

    /**
     * If the attack can crit
     * @type { boolean }
     */
    canCrit = true;

    /**
     * If the attack has super-advantage (e.g. Elven Accuracy)
     * @type { boolean }
     */
    superAdvantage;

    /**
     * Base damage formula for the weapon the attack is using
     * @type { string }
     */
    damageBase;

    /**
     * Base to hit bonus
     * @type { string }
     */
    toHitBonus;

    /**
     * Base damage bonus
     * @type { string }
     */
    damageBonus;

    
    /**
     * Crit threshold of the attack. If the to-hit dice rolls more than this, the attack will be considered a crit.
     * @type { number }
     */
    critThreshold;

    
    /**
     * List of bonuses to apply to the attack
     * @type { AttackBonus[] }
     */
    bonuses = [];

    /**
     * Returns the flattened bonus list
     * @returns { AttackBonus[] }
     */
    getAllBonuses() {
        return this._getAllBonusesInner(this.bonuses);
    }

    /**
     * @param {AttackBonus[]} bonuses 
     * @returns {AttackBonus[]}
     * @private
     */
    _getAllBonusesInner(bonuses) {
        let r = [];
        bonuses?.forEach(b => {
            if (b.bonuses && b.bonuses.length > 0) {
                r.push(...this._getAllBonusesInner(b.bonuses));
            } 
            if (b.type !== 'group') {
                r.push(b);
            }
        });
        return r;     
    }

    show() {
        if (this.debug) console.log('Executing attack:', this);
    
        const attackDto = new AttackDTO(this);
        const attackFormatter = new AttackFormatter();
    
        const attackForm = attackFormatter.createAttackForm(attackDto);
        if (attackDto.debug) console.log('Dialog form:', attackForm);
    
        let d = new Dialog({
         title: attackDto.title,
         content: attackForm,
         buttons: {
          normal: {
           icon: '<i class="fas fa-check"></i>',
           label: "Normal",
           callback: () => attackDto.run = true
          },
          advantage: {
           icon: '<i class="fas fa-arrow-up"></i>',
           label: "Adv.",
           callback: () => {
            attackDto.run = true;
            attackDto.advantage = true;
           }
          },
          disadvantage: {
           icon: '<i class="fas fa-arrow-down"></i>',
           label: "Disadv.",
           callback: () => {
            attackDto.run = true;
            attackDto.disadvantage = true;
           }
          },
         },
         default: "normal",
         close: async html => {
            if (!attackDto.run) return;
            attackDto.bindToHtml(html);
            if (attackDto.debug) console.log('Bound Attack:', attackDto);
         
            const attackResult = await attackDto.getResults();
        
            ChatMessage.create({
                user: game.user._id,
                content: await attackResult.toHtml()
            });
         }
        });
        d.render(true);
    }

    constructor(obj) {
        this.title = obj.title;
        this.rollToHit = obj.rollToHit ?? this.rollToHit;
        this.superAdvantage = obj.superAdvantage;
        this.damageBase = obj.damageBase;
        this.toHitBonus = obj.toHitBonus;
        this.canCrit = obj.canCrit ?? this.canCrit;
        this.critThreshold = obj.critThreshold;
        this.damageBonus = obj.damageBonus;
        if (obj.bonuses && Array.isArray(obj.bonuses)) {
            this.bonuses = obj.bonuses.map(b => new AttackBonus(b));
        }
    }
}

class AttackBonus {
    /** @type {string} */
    description;
    /** @type {string} */
    type;
    /** @type {string} */
    toHitBonus;
    /** @type {string} */
    damageBonus;
    /** @type {string} */
    critBonusOverride;

    /** 
     * Child bonuses (to use with type = group)
     * @type {AttackBonus[]} 
     */
    bonuses = [];

    /**
     * @callback valueCallback
     * @param {number} value
     * @returns {boolean} Enable or disable the Attack Bonus
     */

    /** 
     * Callback called by number type bonuses
     * @type {valueCallback} 
     */
    valueCallback;

    /** 
     * Other rolls to add at the end of the chat message
     * @type {SimpleRoll[]} 
     */
    otherRolls = [];
    /** @type {boolean} */
    canCrit = true;
    /** @type {boolean} */
    enabled = false;
    /** @type {boolean} */
    hide = false;
    /** @type {string} */
    group;

    constructor(obj) {
        this.description = obj.description;
        this.type = obj.type;
        this.toHitBonus = obj.toHitBonus;
        this.damageBonus = obj.damageBonus;
        this.canCrit = obj.canCrit;
        this.critBonusOverride = obj.critBonusOverride;
        this.enabled = obj.enabled;
        this.hide = obj.hide;
        this.group = obj.group;
        if (obj.otherRolls && Array.isArray(obj.otherRolls)) {
            this.otherRolls = obj.otherRolls.map(r => new SimpleRoll(r));
        }
        if (obj.bonuses && Array.isArray(obj.bonuses)) {
            this.bonuses = obj.bonuses.map(b => new AttackBonus(b));
        }
        this.valueCallback = obj.valueCallback;
    }
}

class SimpleRoll {
    /** @type {string} */
    description;
    /** @type {string} */
    roll;
    /** @type {boolean} */
    canCrit;

    constructor(obj) {
        Object.assign(this, obj);
    }
}

class AttackFormatter {
    indexer;
    /**
     * Creates the html form to display in the attack dialog box
     * @param {AttackDTO} attack 
     * @returns {string}
     */
    createAttackForm(attack) {
        let htmlContent = '<form>';
        let indexer = 0;
        attack.bonuses?.forEach(b => {
            if (!b.hide) {
                htmlContent += this._createFormGroup(b);
            }
        });
        htmlContent += `<div class="form-group">
            <label for='toHitBonusCustom'>Custom To Hit Bonus</label><input id='toHitBonusCustom' type='text' name='Custom To Hit Bonus' />
        </div>
        <div class="form-group">
            <label for='damageBonusCustom'>Custom Damage Bonus</label><input id='damageBonusCustom' type='text' name='Custom Damage Bonus' />
        </div>
        </form>`;
        return htmlContent;
    }

    //Creates the form groups to show each bonus
    _createFormGroup(bonus) {
        let fg = '';
        if (bonus.type === 'group' && bonus.bonuses) {
            fg += '<div>';
            fg += `<label>${bonus.description}</label>`;
            bonus.bonuses.forEach(b => fg += this._createFormGroup(b));
            fg += '</div>';
        } else {
            fg += '<div class="form-group">';
            fg += this._createControl(bonus);
            fg += '</div>';
        }
        return fg;
    }

    //Creates a control based on the bonus type
    _createControl(bonus) {
        this.indexer++;
        bonus.id = `b${Date.now()}${this.indexer}`;
        switch(bonus.type) {
            case 'number':
                return `<label for='${bonus.id}'>${bonus.description}</label><input id='${bonus.id}' name='${bonus.description}' type='number'/>`;
            case 'check':
                return `<input id='${bonus.id}' name='${bonus.description}' type='checkbox' ${(bonus.enabled ? 'checked': '')}/><label for='${bonus.id}'>${bonus.description}</label>`;
            case 'radio':
                return `<input id='${bonus.id}' name='${bonus.group}' type='radio' ${(bonus.enabled ? 'checked': '')} style="flex: 0 0 20px;"/><label for='${bonus.id}'>${bonus.description}</label>`;
        }
    }

    constructor() {
        this.indexer = 0;
    }
}

class AttackDTO extends Attack {
    /**
     * If the attack has been confirmed
     * False if the user closed the dialog box
     * @type { boolean }
     */
    run;

    /**
     * If the attack has advantage
     * @type { boolean }
     */
    advantage;

    /**
     * If the attack has disadvantage
     * @type { boolean }
     */
    disadvantage;


    /**
     * Custom to hit bonus
     * @type { string }
     */
    toHitBonusCustom;

    /**
     * Custom damage bonus
     * @type { string }
     */
    damageBonusCustom;

    
    /**
     * List of bonuses that got applied to the attack
     * @type { AttackBonus[] }
     */
    appliedBonuses = [];

    /**
     * List of other rolls that got applied to the attack
     * @type { SimpleRoll[] }
     */
    otherRolls = [];


    /**
     * Binds the result HTML to the attack model
     * @param {*} html 
     */
    bindToHtml(html) {
        if (this.debug) console.log(`Binding to HTML`);
        if (this.debug) console.log(`All Bonuses:`, this.bonuses, this.getAllBonuses());
        this.getAllBonuses().forEach(bonus => {
            if (this.debug) console.log(`Checking for input of bonus`, bonus);
            const e = html.find(`[id="${bonus.id}"]`)[0];
            if (e) {
                if (this.debug) console.log(`Input ${bonus.id}`, e);
                switch(bonus.type) {
                    case 'number':
                        if (e.value) {
                            bonus.enabled = bonus.valueCallback(this, bonus, e.value);
                        } else {
                            bonus.enabled = false;
                        }
                        break;
                    case 'check':
                    case 'radio':
                        bonus.enabled = e.checked;
                        break;
                }
            }
            if (bonus.enabled) {
                this.appliedBonuses.push(bonus);
                if (bonus.otherRolls) {
                    this.otherRolls.push(...bonus.otherRolls);
                }
            }
        });
        const cthe = html.find('[id="toHitBonusCustom"]')[0];
        if (cthe && cthe.value) {
            this.toHitBonusCustom = '';
            if (cthe.value.charAt(0) != '+' && cthe.value.charAt(0) != '-') {
                this.toHitBonusCustom += '+';
            }
            this.toHitBonusCustom += cthe.value;
        }
        const cde = html.find('[id="damageBonusCustom"]')[0];
        if (cde && cde.value) {
            this.damageBonusCustom = '';
            if (cde.value.charAt(0) != '+' && cde.value.charAt(0) != '-') {
                this.damageBonusCustom += '+';
            }
            this.damageBonusCustom += cde.value;
        }
    }

    /**
     * Returns the to-hit expression
     * @returns {string}
     */
    getToHitExpression() {
        let toHitExpression = '';
        if (this.rollToHit) {
            if (this.advantage) {
                toHitExpression = this.superAdvantage ? '3d20kh' : '2d20kh';
            }
            else if (this.disadvantage) {
                toHitExpression = '2d20kl';
            }
            else {
                toHitExpression = '1d20';
            }
            toHitExpression += this.toHitBonus;
            this.appliedBonuses.forEach(b => {
                if (b.toHitBonus) {
                    toHitExpression += b.toHitBonus;
                }
            });
            if (this.toHitBonusCustom) toHitExpression += this.toHitBonusCustom;
        }
        return toHitExpression;
    }
    
    /**
     * Returns the damage expression
     * @returns {string}
     */
    getDamageExpression() {
        let damageExpression = this.damageBase + this.damageBonus;
        this.appliedBonuses.forEach(b => {
            if (b.damageBonus) {
                damageExpression += b.damageBonus;
            }
        });
        if (this.damageBonusCustom) damageExpression += this.damageBonusCustom;
        return damageExpression;    
    }
    
    /**
     * Returns the crit expression
     * @returns {string}
     */
    getCritExpression() {
        let critExpression = '';
        let r = new Roll.defaultImplementation(this.damageBase + this.damageBonus + this.damageBonusCustom);
        r.dice?.forEach(d => critExpression += `+${d.formula}`);
        this.appliedBonuses.forEach(b => {
            if (b.critBonusOverride) {
                critExpression += b.critBonusOverride;
            } else if (b.damageBonus) {
                let r = new Roll.defaultImplementation(b.damageBonus);
                r.dice?.forEach(d => critExpression += `+${d.formula}`);
            }
        });
        return critExpression;
    }
    
    /**
     * Returns the attack result
     * 
     * @async
     * @returns {Promise<AttackResult>}
     */
    async getResults() {
        const toHitExpression = this.getToHitExpression();
        const damageExpression = this.getDamageExpression();
        const critExpression = this.getCritExpression();
    
        const attackResult = new AttackResult({ title: this.title });
    
        if (this.rollToHit && toHitExpression) {
            const toHitRoll = await new Roll.defaultImplementation(toHitExpression).evaluate();
            if (this.debug) console.log('To Hit Roll:', toHitRoll);
            attackResult.isCrit = this.canCrit && toHitRoll.dice.some(d => d.results.some(r => r.active && r.result >= this.critThreshold));
    
            attackResult.toHitRoll = toHitRoll;
        }
    
        const damageRoll = await new Roll.defaultImplementation(damageExpression).evaluate();
        if (this.debug) console.log('Damage Roll:', damageRoll);
        attackResult.damageRoll = damageRoll;
    
        if (attackResult.isCrit) {
            const critRoll = new Roll.defaultImplementation(critExpression);
            await critRoll.evaluate();
            if (this.debug) console.log('Crit Roll:', critRoll);
    
            attackResult.critRoll = critRoll;
        }
    
        attackResult.otherRolls = (await Promise.all(this.otherRolls.map(async r => {
            const roll = new Roll.defaultImplementation(r.roll);
            await roll.evaluate();
            let cRoll = null;
            if (attackResult.isCrit && r.canCrit) {
                let cexpr = roll.dice?.map(d => d.formula).join('+');
                if (cexpr) {
                    cRoll = new Roll.defaultImplementation(cexpr);
                    await cRoll.evaluate();
                }
            }
            return { description: r.description, roll: roll, critRoll: cRoll };
        })));
    
        if (this.debug) console.log('Attack Results:', attackResult);
    
        return attackResult;
    }

    /**
     * @param {Attack} attack 
     */
    constructor(attack) {
        super(attack);
    }
}

class AttackResult {
    /** @type {string} */
    title;

    /** @type {object} */
    toHitRoll = null;
    
    /** @type {object} */
    damageRoll = null;

    /** @type {object} */
    critRoll = null;

    /** @type {boolean} */
    isCrit;

    /** @type {object[]} */
    otherRolls = [];

    constructor(obj) {
        Object.assign(this, obj);
    }

    /**
     * Converts the result to an HTML message
     * @async
     * @returns {Promise<string>}
     */
    async toHtml() {
        let results_html = `<h3>${this.title}</h3>
        <p><b>To Hit:</b> ${(await this.toHitRoll.toAnchor().outerHTML)}${this.isCrit ? (' <b>CRIT!</b>') : ''}</p>
        <p><b>Damage:</b> ${(await this.damageRoll.toAnchor().outerHTML)}${this.isCrit ? (`+ ${(await this.critRoll.toAnchor().outerHTML)} (CRIT) = ${this.damageRoll.total + this.critRoll.total}`) : ''}</p>`
        if (!!this.otherRolls) {
            results_html += '<hr>';
            results_html += (await Promise.all(this.otherRolls
                .map(async o => `<p>${o.description}: ${(await o.roll.toAnchor().outerHTML)}${!!o.critRoll ? (`+ ${(await o.critRoll.toAnchor().outerHTML)} (CRIT) = ${o.roll.total + o.critRoll.total}`) : ''}</p>`))
                ).join('')
        }
        return results_html;
    }
}

class BonusPresets {
    static greatWeaponMaster = (options) => new AttackBonus({...{ description: 'Great Weapon Master', type: 'check', toHitBonus: '-5[GWM]', damageBonus: '+10[GWM]' }, ...options});
    static sharpShooter = (options) => new AttackBonus({...{ description: 'Sharpshooter', type: 'check', toHitBonus: '-5[Sharpshooter]', damageBonus: '+10[Sharpshooter]' }, ...options});
    static piercer = (options) => new AttackBonus({...{ description: 'Piercer', type: 'check', toHitBonus: '', damageBonus: '', critBonusOverride: '+1d6[Piercer Crit]', enabled: true, hide: true, otherRolls: [{ description: 'Piercer Replacement', roll: '+1d8', canCrit: false }] }, ...options});
    static greenFlameBlade = (options) => new AttackBonus({...{ description: 'Green Flame Blade', type: 'check', 'toHitBonus': '', damageBonus: '+2d8[GFB]', otherRolls: [{ description: 'GFB Proximity Damage', roll: '3+2d8', canCrit: true}] }, ...options});
    static boomingBlade = (options) => new AttackBonus({...{ description: 'Booming Blade', type: 'check', 'toHitBonus': '', damageBonus: '+2d8[Booming Blade]', otherRolls: [{ description: 'Booming Blade (movement)', roll: '+3d8', canCrit: false }] }, ...options});
}

Hooks.once('init', () => {
    const gl = window || global;
    gl.shadranMacros = {...(gl.shadranMacros ?? {}), 
        attacks: { 
            createAttack: (att) => new AttackDTO(att),
            presets: {
                greatWeaponMaster: BonusPresets.greatWeaponMaster,
                sharpShooter: BonusPresets.sharpShooter,
                piercer: BonusPresets.piercer,
                greenFlameBlade: BonusPresets.greenFlameBlade,
                boomingBlade: BonusPresets.boomingBlade
            }
        } 
    }
});


export { AttackDTO }