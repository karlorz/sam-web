import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Input } from './input';
import { Button } from './button';

interface InputDialogProps {
  defaultURL: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  submitCallback: (url: string) => void;
}

export default function InputDialog({
  defaultURL,
  open,
  setOpen,
  submitCallback,
}: InputDialogProps) {
  const [url, setURL] = useState(defaultURL);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter Image URL</DialogTitle>
          <DialogDescription>
            Please provide a URL for the image you want to process
          </DialogDescription>
        </DialogHeader>
        <Input
          value={url}
          onChange={(e) => setURL(e.target.value)}
          placeholder="https://example.com/image.jpg"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              submitCallback(url);
              setOpen(false);
            }}
          >
            Load Image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
