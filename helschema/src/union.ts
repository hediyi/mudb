import HelModel from './model';
import {HelUnion} from './_union';

export = function<SubTypes extends {[key:string]:HelModel<any>}> (subtypes:SubTypes, identityType?:keyof SubTypes, identityData?:SubTypes[keyof SubTypes]['identity']) {
    console.log('subtypes', subtypes);
    console.log('identityType', identityType);
    console.log('identityData', identityData);
    type StateType = {
        type: keyof SubTypes;
        data: SubTypes[keyof SubTypes]['identity'];
    };
    return new HelUnion<SubTypes, StateType>(
        subtypes,
        {
            type: identityType || '',
            data: (identityData && identityType ? subtypes[identityType].clone(identityData) : null),
        }
    );
}