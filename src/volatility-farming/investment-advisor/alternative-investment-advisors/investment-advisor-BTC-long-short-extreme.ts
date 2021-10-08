
// this is a slightly opinionated (long) investment advisor
// it serves edcucational purposes and shall inspire friends to implement different strategies and apply them within this network
// https://www.math3d.org/2cj0XobI 

import { sleep } from "https://deno.land/x/sleep@v1.2.0/mod.ts";
import { FinancialCalculator } from "../../../utility-boxes/financial-calculator.ts";
import { VFLogger } from "../../../utility-boxes/logger.ts";
import { IPersistenceService } from "../../volatility-farmer/persistency/interfaces.ts";
import { IInvestmentAdvisor, InvestmentAdvice, InvestmentOption, Action, InvestmentDecisionBase, IPosition } from "../interfaces.ts";


export class InvestmentAdvisorBTCLongShortExtreme implements IInvestmentAdvisor {

    private currentInvestmentAdvices: InvestmentAdvice[] = []
    private lastAdviceDate: Date = new Date()

    private investmentOptions: InvestmentOption[] = [
        {
            pair: "BTCUSDT",
            minTradingAmount: 0.001
        }
    ]

    public constructor(private apiKey: string, private mongoService: IPersistenceService | undefined) { }


    public getInvestmentOptions(): InvestmentOption[] {
        return this.investmentOptions
    }
    public async getInvestmentAdvices(investmentDecisionBase: any): Promise<InvestmentAdvice[]> {

        this.currentInvestmentAdvices = []

        // console.log(investmentDecisionBase)
        for (const investmentOption of this.investmentOptions) {
            for (const move of Object.values(Action)) {
                await sleep(0.05)
                await this.deriveInvestmentAdvice(investmentOption, move, investmentDecisionBase)

            }

        }

        return this.currentInvestmentAdvices

    }

    protected async deriveSpecialCaseMoves(investmentOption: InvestmentOption, lsd: number, investmentDecisionBase: InvestmentDecisionBase, longPosition: any, shortPosition: any, liquidityLevel: number): Promise<void> {


        let overallPNL = 0
        try {
            overallPNL = FinancialCalculator.getOverallPNLInPercent(longPosition, shortPosition)
        } catch (error) {
            console.log(error.message)
        }

        if (investmentDecisionBase.accountInfo.result.USDT.equity < investmentDecisionBase.minimumReserve || liquidityLevel === 0 || overallPNL > 45) {

            await this.checkCloseAll(investmentOption, investmentDecisionBase, liquidityLevel, overallPNL, longPosition, shortPosition)

        } else if (longPosition !== undefined && shortPosition !== undefined && shortPosition.data.unrealised_pnl < 0 && longPosition.data.unrealised_pnl < 0 && liquidityLevel > 10) {

            await this.checkNarrowingDownDiffPNL(investmentOption)

        } else {

            await this.checkSetup(longPosition, shortPosition, investmentOption)

        }

    }


    protected async checkSetup(longPosition: any, shortPosition: any, investmentOption: InvestmentOption): Promise<void> {
        if (longPosition === undefined) {

            const investmentAdvice: InvestmentAdvice = {
                action: Action.BUY,
                amount: investmentOption.minTradingAmount,
                pair: investmentOption.pair,
                reason: `we open a ${investmentOption.pair} long position to play the game`
            }

            this.currentInvestmentAdvices.push(investmentAdvice)

        }

        if (shortPosition === undefined) {

            const investmentAdvice: InvestmentAdvice = {
                action: Action.SELL,
                amount: investmentOption.minTradingAmount,
                pair: investmentOption.pair,
                reason: `we open a ${investmentOption.pair} short position to play the game`
            }

            this.currentInvestmentAdvices.push(investmentAdvice)

        }

    }


    protected async checkCloseAll(investmentOption: InvestmentOption, investmentDecisionBase: InvestmentDecisionBase, liquidityLevel: number, overallPNL: number, longPosition: any, shortPosition: any): Promise<void> {

        let specificmessage = ""

        if (investmentDecisionBase.accountInfo.result.USDT.equity < investmentDecisionBase.minimumReserve) {
            specificmessage = "an equity drop"
        } else if (liquidityLevel === 0) {
            specificmessage = "a liquidity crisis"

        } else if (overallPNL > 45) {
            specificmessage = `an overall PNL of ${overallPNL}`
        }

        const investmentAdvice: InvestmentAdvice = {
            action: Action.REDUCELONG,
            amount: longPosition.data.size,
            pair: investmentOption.pair,
            reason: `we close ${longPosition.data.size} ${investmentOption.pair} long due to ${specificmessage}`
        }

        this.currentInvestmentAdvices.push(investmentAdvice)

        const investmentAdvice2: InvestmentAdvice = {
            action: Action.REDUCESHORT,
            amount: shortPosition.data.size,
            pair: investmentOption.pair,
            reason: `we close ${longPosition.data.size} ${investmentOption.pair} short due to ${specificmessage}`
        }

        this.currentInvestmentAdvices.push(investmentAdvice2)

        if (overallPNL <= 45) {
            const investmentAdvice3: InvestmentAdvice = {
                action: Action.PAUSE,
                amount: 0,
                pair: '',
                reason: `we pause the game due to ${specificmessage}`
            }

            this.currentInvestmentAdvices.push(investmentAdvice3)
        }
    }
    protected async checkNarrowingDownDiffPNL(investmentOption: InvestmentOption): Promise<void> {

        const investmentAdvice: InvestmentAdvice = {
            action: Action.BUY,
            amount: investmentOption.minTradingAmount,
            pair: investmentOption.pair,
            reason: `we enhance both positions to narrow down the diff pnl`
        }

        this.currentInvestmentAdvices.push(investmentAdvice)

        const investmentAdvice2: InvestmentAdvice = {
            action: Action.SELL,
            amount: investmentOption.minTradingAmount,
            pair: investmentOption.pair,
            reason: `we enhance both positions to narrow down the diff pnl`
        }

        this.currentInvestmentAdvices.push(investmentAdvice2)

    }

    protected async deriveInvestmentAdvice(investmentOption: InvestmentOption, move: Action, investmentDecisionBase: InvestmentDecisionBase): Promise<void> {

        // console.log(investmentDecisionBase.positions)
        const longShortDeltaInPercent = FinancialCalculator.getLongShortDeltaInPercent(investmentDecisionBase.positions)
        const liquidityLevel = (investmentDecisionBase.accountInfo.result.USDT.available_balance / investmentDecisionBase.accountInfo.result.USDT.equity) * 20

        const longPosition: IPosition = investmentDecisionBase.positions.filter((p: any) => p.data.side === 'Buy')[0]
        const shortPosition: IPosition = investmentDecisionBase.positions.filter((p: any) => p.data.side === 'Sell')[0]

        if (move === Action.PAUSE) { // here just to ensure the following block is executed only once

            await this.deriveSpecialCaseMoves(investmentOption, longShortDeltaInPercent, investmentDecisionBase, longPosition, shortPosition, liquidityLevel)

        } else if (longPosition !== undefined && shortPosition !== undefined && this.currentInvestmentAdvices.length === 0) {

            await this.deriveStandardMoves(investmentOption, longShortDeltaInPercent, move, longPosition, shortPosition, liquidityLevel)

        }

    }

    protected async deriveStandardMoves(investmentOption: InvestmentOption, lsd: number, move: Action, longPosition: any, shortPosition: any, liquidityLevel: number): Promise<void> {

        switch (move) {

            case Action.BUY: {

                let addingPointLong = this.getAddingPointLong(lsd, liquidityLevel)
                let pnlLong = FinancialCalculator.getPNLOfPositionInPercent(longPosition)

                const message = `adding point long: ${addingPointLong.toFixed(2)} (${pnlLong})`
                await VFLogger.log(message, this.apiKey, this.mongoService)

                if (pnlLong < addingPointLong) {
                    let factor = Math.floor(Math.abs(lsd) / 10)
                    if (factor < 1) factor = 1
                    const amount = investmentOption.minTradingAmount * factor
                    const reason = `we enhance our ${investmentOption.pair} long position by ${amount} due to a great price`
                    this.addInvestmentAdvice(Action.BUY, amount, investmentOption.pair, reason)
                }

                break

            }

            case Action.SELL: {

                let addingPointShort = this.getAddingPointShort(lsd, liquidityLevel)
                let pnlShort = FinancialCalculator.getPNLOfPositionInPercent(shortPosition)

                const message = `adding point short: ${addingPointShort.toFixed(2)} (${pnlShort})`
                await VFLogger.log(message, this.apiKey, this.mongoService)

                if (pnlShort < addingPointShort) {

                    let factor = Math.floor(Math.abs(lsd) / 10)
                    if (factor < 1) factor = 1
                    const amount = investmentOption.minTradingAmount * factor
                    const reason = `we enhance our ${investmentOption.pair} short position by ${amount} due to a great price`
                    this.addInvestmentAdvice(Action.SELL, investmentOption.minTradingAmount, investmentOption.pair, reason)
                }

                break
            }

            case Action.REDUCELONG: {

                let closingPointLong = this.getClosingPointLong(lsd)
                let pnlLong = FinancialCalculator.getPNLOfPositionInPercent(longPosition)

                const message = `closing point long: ${closingPointLong.toFixed(2)} (${pnlLong})`
                await VFLogger.log(message, this.apiKey, this.mongoService)

                if (pnlLong > closingPointLong && longPosition.data.size > investmentOption.minTradingAmount) {
                    const reason = `we reduce our ${investmentOption.pair} long position to realize ${pnlLong}% profits`
                    this.addInvestmentAdvice(Action.REDUCELONG, investmentOption.minTradingAmount, investmentOption.pair, reason)
                }

                break

            }

            case Action.REDUCESHORT: {

                let closingPointShort = this.getClosingPointShort(lsd)
                let pnlShort = FinancialCalculator.getPNLOfPositionInPercent(shortPosition)

                const message = `closing point short: ${closingPointShort.toFixed(2)} (${pnlShort})`
                await VFLogger.log(message, this.apiKey, this.mongoService)

                if (pnlShort > closingPointShort && shortPosition.data.size > investmentOption.minTradingAmount) {
                    const reason = `we reduce our ${investmentOption.pair} short position to realize ${pnlShort}% profits`
                    this.addInvestmentAdvice(Action.REDUCESHORT, investmentOption.minTradingAmount, investmentOption.pair, reason)
                }

                break

            }

            default: throw new Error(`you detected an interesting situation`)

        }
    }

    protected addInvestmentAdvice(action: Action, amount: number, pair: string, reason: string) {

        const investmentAdvice: InvestmentAdvice = {
            action,
            amount,
            pair,
            reason
        }

        this.currentInvestmentAdvices.push(investmentAdvice)

        this.lastAdviceDate = new Date()

    }

    protected getAddingPointLong(longShortDeltaInPercent: number, liquidityLevel: number): number {

        let aPL = (longShortDeltaInPercent < 0) ?
            -11 :
            (Math.abs(longShortDeltaInPercent) * -4) - 11

        const refDate = new Date();
        refDate.setMinutes(refDate.getMinutes() - 5);

        if (this.lastAdviceDate < refDate) {
            aPL = aPL / liquidityLevel
        }

        return aPL

    }


    protected getAddingPointShort(longShortDeltaInPercent: number, liquidityLevel: number): number {

        let aPS = (longShortDeltaInPercent < 0) ?
            (Math.abs(longShortDeltaInPercent) * -7) - 11 :
            - 11

        const refDate = new Date();
        refDate.setMinutes(refDate.getMinutes() - 5);

        if (this.lastAdviceDate < refDate) {
            aPS = aPS / liquidityLevel
        }

        return aPS

    }


    protected getClosingPointLong(longShortDeltaInPercent: number): number {

        return (longShortDeltaInPercent < 0) ?
            Math.abs(longShortDeltaInPercent) * 7 + 45 :
            36

    }


    protected getClosingPointShort(longShortDeltaInPercent: number): number {

        return (longShortDeltaInPercent > 0) ?
            longShortDeltaInPercent * 7 + 36 :
            36

    }

}