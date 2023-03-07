import { dynamicDep } from './demo';

describe('dynamicDep', () => {
  it('should work', () => {
    expect(dynamicDep()).toEqual('dynamic');
  });
});
