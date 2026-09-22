// 源: arc-core/src/arc/math/WindowedMean.java
// 迁移说明: 逐字移植, 数值 float64。
import {Mathf} from './Mathf';

/**
 * A simple class keeping track of the mean of a stream of values within a certain window. the WindowedMean will only return a
 * value in case enough data has been sampled.
 */
export class WindowedMean{
    private values: number[];
    private addedValues = 0;
    private lastValue = 0;
    private meanValue = 0;
    private dirty = true;

    /**
     * constructor, windowSize specifies the number of samples we will continuously get the mean and variance from.
     * @param windowSize size of the sample window
     */
    constructor(windowSize: number){
        this.values = new Array<number>(windowSize);
    }

    reset(): void{
        this.addedValues = 0;
        this.lastValue = 0;
        this.meanValue = 0;
    }

    get(index: number): number{
        return this.values[Mathf.mod(index + this.lastValue, this.values.length)];
    }

    /** @return whether the value returned will be meaningful */
    hasEnoughData(): boolean{
        return this.addedValues >= this.values.length;
    }

    /** clears this WindowedMean. */
    clear(): void{
        this.addedValues = 0;
        this.lastValue = 0;
        this.values.fill(0);
        this.dirty = true;
    }

    fill(value: number): void{
        this.dirty = true;
        this.values.fill(value);
        this.addedValues = this.values.length;
    }

    /**
     * adds a new sample to this mean. In case the window is full the oldest value will be replaced by this new value.
     */
    add(value: number): void{
        if(this.addedValues < this.values.length) this.addedValues++;
        this.values[this.lastValue++] = value;
        if(this.lastValue > this.values.length - 1) this.lastValue = 0;
        this.dirty = true;
    }

    /**
     * returns the mean of the samples added to this instance.
     */
    mean(): number{
        if(this.hasEnoughData()){
            if(this.dirty){
                let mean = 0;
                for(let i = 0; i < this.values.length; i++){
                    mean += this.values[i];
                }
                this.meanValue = mean / this.values.length;
                this.dirty = false;
            }
            return this.meanValue;
        }else return 0;
    }

    /** @return raw mean; can be used before this window has enough data. */
    rawMean(): number{
        if(this.hasEnoughData()){
            return this.mean();
        }else if(this.addedValues === 0){
            return 0;
        }else{
            let sum = 0;
            for(let i = 0; i < this.lastValue; i++){
                sum += this.values[i];
            }
            return sum / this.addedValues;
        }
    }

    /** @return the oldest value in the window */
    oldest(): number{
        return this.addedValues < this.values.length ? this.values[0] : this.values[this.lastValue];
    }

    /** @return the value last added */
    latest(): number{
        return this.values[this.lastValue - 1 === -1 ? this.values.length - 1 : this.lastValue - 1];
    }

    /** @return The standard deviation */
    standardDeviation(): number{
        if(!this.hasEnoughData()) return 0;

        const mean = this.mean();
        let sum = 0;
        for(let i = 0; i < this.values.length; i++){
            sum += (this.values[i] - mean) * (this.values[i] - mean);
        }

        return Math.sqrt(sum / this.values.length);
    }

    lowest(): number{
        let lowest = Number.MAX_VALUE;
        for(let i = 0; i < this.values.length; i++){
            lowest = Math.min(lowest, this.values[i]);
        }
        return lowest;
    }

    highest(): number{
        let lowest = 1.17549435e-38; // Float.MIN_NORMAL
        for(let i = 0; i < this.values.length; i++){
            lowest = Math.max(lowest, this.values[i]);
        }
        return lowest;
    }

    getCount(): number{
        return this.addedValues;
    }

    getWindowSize(): number{
        return this.values.length;
    }

    /**
     * @return A new <code>float[]</code> containing all values currently in the window of the stream, in order from oldest to
     * latest.
     */
    getWindowValues(): number[]{
        const windowValues = new Array<number>(this.addedValues);
        if(this.hasEnoughData()){
            for(let i = 0; i < windowValues.length; i++){
                windowValues[i] = this.values[(i + this.lastValue) % this.values.length];
            }
        }else{
            for(let i = 0; i < this.addedValues; i++){
                windowValues[i] = this.values[i];
            }
        }
        return windowValues;
    }
}
