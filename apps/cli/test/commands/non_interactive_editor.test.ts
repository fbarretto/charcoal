import { expect } from 'chai';
import { allScenes } from '../lib/scenes/all_scenes';
import { configureTest } from '../lib/utils/configure_test';

for (const scene of allScenes) {
  describe(`(${scene}): editors without a terminal`, function () {
    configureTest(this, scene);

    beforeEach(() => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('a2', 'a2');
      scene.repo.runCliCommand([`modify`, `-c`, `-m`, `a2`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.checkoutBranch('a');
    });

    const refs = () =>
      ['a', 'b'].map((b) => scene.repo.getRef(`refs/heads/${b}`));

    for (const [command, hint] of [
      [['modify', '-c'], '-m'],
      [['modify', '--into', 'a', '-c'], '-m'],
      [['create', 'c'], '-m'],
      [['squash'], '--no-edit'],
      [['reorder'], 'ch move'],
      [['edit'], 'interactive terminal'],
    ] as const) {
      it(`Fails fast naming the alternative: ch ${command.join(' ')}`, () => {
        if (command[0] === 'modify' && command[1] === '--into') {
          scene.repo.checkoutBranch('b');
        }
        scene.repo.createChange('staged', 'staged');
        const before = refs();

        expect(() => scene.repo.runCliCommand([...command])).to.throw(hint);

        expect(refs()).to.deep.equal(before);
        expect(
          scene.repo.runGitCommandAndGetOutput(['branch', '--list', 'c'])
        ).to.equal('');
      });
    }
  });
}
